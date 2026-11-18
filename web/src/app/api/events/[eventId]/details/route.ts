import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AuthError, assertEventAccess, requireAuthUser, requireBandAction, writeAuditLog } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse, json } from "@/lib/http";
import { parseRider } from "@/lib/rider";

type Context = { params: Promise<{ eventId: string }> };

const isoDateTime = z.string().datetime({ offset: true });

const patchSchema = z.object({
  isPublic: z.boolean().optional(),
  contactName: z.string().trim().max(120).nullable().optional(),
  contactEmail: z.string().trim().email().max(200).nullable().optional().or(z.literal("")),
  contactPhone: z.string().trim().max(60).nullable().optional(),
  feeCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
  feeStatus: z.enum(["open", "invoiced", "paid", "none"]).nullable().optional(),
  loadInAt: isoDateTime.nullable().optional(),
  soundcheckAt: isoDateTime.nullable().optional(),
  doorsAt: isoDateTime.nullable().optional(),
});

/** Everything for the event detail page: gig data, protocol, attendance, setlist, rider. */
export async function GET(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const eventId = parseUuid((await context.params).eventId, "Termin-ID");
    const { bandId } = await assertEventAccess(session.userId, eventId);
    const [event, members, band] = await Promise.all([
      prisma.event.findUnique({
        where: { id: eventId },
        include: {
          setlist: { select: { id: true, name: true, items: { orderBy: { position: "asc" }, select: { song: { select: { id: true, title: true, durationSeconds: true } } } } } },
          log: { include: { updatedBy: { select: { id: true, displayName: true } } } },
          logSongs: { include: { song: { select: { id: true, title: true } } } },
          attendance: { select: { userId: true, present: true } },
          transactions: { select: { id: true, amountCents: true, description: true, date: true } },
          availabilities: { select: { userId: true, status: true, note: true } },
        },
      }),
      prisma.bandMember.findMany({
        where: { bandId, role: { not: "guest" } },
        select: { userId: true, role: true, instrumentPrimary: true, user: { select: { displayName: true, avatarUrl: true } } },
        orderBy: { joinedAt: "asc" },
      }),
      prisma.band.findUnique({ where: { id: bandId }, select: { name: true, rider: true, timezone: true } }),
    ]);
    if (!event || event.status === "availability_template") throw new AuthError("Termin nicht gefunden.", 404);
    return json({ event, members, band: band ? { name: band.name, timezone: band.timezone, rider: parseRider(band.rider) } : null });
  } catch (error) {
    return errorResponse(error, "Termin konnte nicht geladen werden.");
  }
}

/** Gig details (contact, fee, load-in/soundcheck/doors). A paid fee is booked into the band cash book once. */
export async function PATCH(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const eventId = parseUuid((await context.params).eventId, "Termin-ID");
    const { bandId } = await assertEventAccess(session.userId, eventId);
    await requireBandAction(session.userId, bandId, "events.manage");
    const payload = patchSchema.parse(await request.json());
    const date = (value: string | null | undefined) => (value === undefined ? undefined : value ? new Date(value) : null);
    const text = (value: string | null | undefined) => (value === undefined ? undefined : value?.trim() || null);
    const event = await prisma.event.update({
      where: { id: eventId },
      data: {
        isPublic: payload.isPublic,
        contactName: text(payload.contactName),
        contactEmail: text(payload.contactEmail),
        contactPhone: text(payload.contactPhone),
        feeCents: payload.feeCents,
        feeStatus: payload.feeStatus === undefined ? undefined : payload.feeStatus,
        loadInAt: date(payload.loadInAt),
        soundcheckAt: date(payload.soundcheckAt),
        doorsAt: date(payload.doorsAt),
      },
    });
    if (event.feeStatus === "paid" && event.feeCents) {
      const booked = await prisma.financeTransaction.count({ where: { eventId, category: "Gage" } });
      if (booked === 0) {
        await prisma.financeTransaction.create({
          data: { bandId, date: new Date(event.startsAt.toISOString().slice(0, 10)), amountCents: event.feeCents, category: "Gage", description: event.title, eventId },
        });
      }
    }
    await writeAuditLog({ bandId, actorUserId: session.userId, action: "event_updated", entityType: "event", entityId: eventId, payload: { title: event.title, gig: true } });
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Gig-Details konnten nicht gespeichert werden.");
  }
}
