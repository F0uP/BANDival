import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AuthError, assertEventAccess, requireAuthUser, writeAuditLog } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse } from "@/lib/http";

const upsertSchema = z.object({
  /** `null` removes the explicit answer so the calendar/day availability applies again. */
  status: z.enum(["available", "maybe", "unavailable"]).nullable(),
  note: z.string().trim().max(1500).nullable().optional(),
});

type Context = { params: Promise<{ eventId: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const eventId = parseUuid((await context.params).eventId, "Termin-ID");
    await assertEventAccess(session.userId, eventId);

    const availabilities = await prisma.eventAvailability.findMany({
      where: { eventId },
      include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ availabilities });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const eventId = parseUuid((await context.params).eventId, "Termin-ID");
    const { bandId } = await assertEventAccess(session.userId, eventId);
    const payload = upsertSchema.parse(await request.json());

    const event = await prisma.event.findUnique({ where: { id: eventId }, select: { title: true, status: true } });
    if (!event || event.status === "availability_template") {
      throw new AuthError("Termin nicht gefunden.", 404);
    }

    if (payload.status === null) {
      await prisma.eventAvailability.deleteMany({ where: { eventId, userId: session.userId } });
      return NextResponse.json({ availability: null });
    }

    const availability = await prisma.eventAvailability.upsert({
      where: { eventId_userId: { eventId, userId: session.userId } },
      create: { eventId, userId: session.userId, status: payload.status, note: payload.note ?? null },
      update: { status: payload.status, note: payload.note === undefined ? undefined : payload.note },
    });

    await writeAuditLog({
      bandId,
      actorUserId: session.userId,
      action: "availability_updated",
      entityType: "event",
      entityId: eventId,
      payload: { status: payload.status, title: event.title },
    });

    return NextResponse.json({ availability });
  } catch (error) {
    return errorResponse(error, "Verfügbarkeit konnte nicht gespeichert werden.");
  }
}
