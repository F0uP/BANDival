import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseBandId } from "@/lib/api";
import { AuthError, requireAuthUser, requireBandAction, requireBandMembership, writeAuditLog } from "@/lib/auth";
import { errorResponse, json } from "@/lib/http";
import { notifyBandMembers } from "@/lib/notifications";
import { assertSetlistInBand, eventFieldsSchema, loadEnrichedEvents, shiftKeepingLocalTime } from "@/lib/events";

const createEventSchema = eventFieldsSchema.extend({
  bandId: z.string().uuid(),
  recurrenceEveryDays: z.number().int().min(1).max(365).nullable().optional(),
  recurrenceCount: z.number().int().min(1).max(104).nullable().optional(),
});

const KIND_LABEL: Record<string, string> = { rehearsal: "Probe", gig: "Gig", meeting: "Meeting", other: "Termin" };

function parseDateParam(value: string | null): Date | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const params = request.nextUrl.searchParams;
    const bandId = parseBandId(params.get("bandId"));
    await requireBandMembership(session.userId, bandId);
    const band = await prisma.band.findUnique({ where: { id: bandId }, select: { timezone: true } });

    const upcoming = params.get("upcoming") === "1";
    const limit = Math.min(500, Math.max(1, Number(params.get("limit") ?? (upcoming ? 10 : 500)) || 500));
    const from = upcoming ? new Date(Date.now() - 3 * 60 * 60 * 1000) : parseDateParam(params.get("from"));
    const to = parseDateParam(params.get("to"));

    const events = await loadEnrichedEvents({
      bandId,
      timeZone: band?.timezone ?? "Europe/Berlin",
      userId: session.userId,
      from,
      to,
      limit,
      includeCancelled: !upcoming,
    });

    return json({ events });
  } catch (error) {
    return errorResponse(error, "Termine konnten nicht geladen werden.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const payload = createEventSchema.parse(await request.json());
    await requireBandAction(session.userId, payload.bandId, "events.create");
    await assertSetlistInBand(payload.bandId, payload.setlistId);

    const band = await prisma.band.findUnique({ where: { id: payload.bandId }, select: { timezone: true } });
    const timeZone = band?.timezone ?? "Europe/Berlin";

    const baseStart = new Date(payload.startsAt);
    const baseEnd = payload.endsAt ? new Date(payload.endsAt) : null;
    if (baseEnd && baseEnd <= baseStart) {
      throw new AuthError("Das Ende muss nach dem Beginn liegen.", 400);
    }
    const durationMs = baseEnd ? baseEnd.getTime() - baseStart.getTime() : null;

    const recurrenceCount = payload.recurrenceEveryDays && payload.recurrenceCount && payload.recurrenceCount > 1 ? payload.recurrenceCount : 1;
    const recurrenceEveryDays = recurrenceCount > 1 ? payload.recurrenceEveryDays ?? null : null;
    const recurrenceGroupId = recurrenceCount > 1 ? randomUUID() : null;

    const events = await prisma.$transaction(
      Array.from({ length: recurrenceCount }).map((_, index) => {
        const startsAt = shiftKeepingLocalTime(baseStart, (recurrenceEveryDays ?? 0) * index, timeZone);
        return prisma.event.create({
          data: {
            bandId: payload.bandId,
            title: payload.title,
            kind: payload.kind,
            status: payload.status,
            startsAt,
            endsAt: durationMs ? new Date(startsAt.getTime() + durationMs) : null,
            venueLabel: payload.venueLabel || null,
            notes: payload.notes || null,
            setlistId: payload.setlistId ?? null,
            recurrenceGroupId,
            recurrenceEveryDays,
            recurrenceCount: recurrenceCount > 1 ? recurrenceCount : null,
          },
          select: { id: true, title: true, startsAt: true },
        });
      }),
    );

    const first = events[0];
    await writeAuditLog({
      bandId: payload.bandId,
      actorUserId: session.userId,
      action: "event_created",
      entityType: "event",
      entityId: first.id,
      payload: { title: payload.title, kind: payload.kind, startsAt: first.startsAt.toISOString(), count: recurrenceCount },
    });

    const dateLabel = first.startsAt.toLocaleString("de-DE", { timeZone, dateStyle: "medium", timeStyle: "short" });
    await notifyBandMembers({
      bandId: payload.bandId,
      actorUserId: session.userId,
      kind: "event",
      type: "event_created",
      title: recurrenceCount > 1 ? `Neue Terminserie: ${payload.title}` : `${KIND_LABEL[payload.kind]}: ${payload.title}`,
      body: recurrenceCount > 1
        ? `${recurrenceCount} Termine ab ${dateLabel}. Bitte trag deine Verfügbarkeit ein.`
        : `${dateLabel}${payload.venueLabel ? ` · ${payload.venueLabel}` : ""}. Bitte trag deine Verfügbarkeit ein.`,
      payload: { eventId: first.id },
    });

    return json({ event: first, events }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Termin konnte nicht erstellt werden.");
  }
}
