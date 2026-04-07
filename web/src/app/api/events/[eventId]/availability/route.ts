import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertEventAccess, AuthError, requireAuthUser, requireBandAction, writeAuditLog } from "@/lib/auth";

const upsertSchema = z.object({
  status: z.enum(["available", "maybe", "unavailable"]),
  note: z.string().max(1500).nullable().optional(),
});

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ eventId: string }> },
) {
  try {
    const session = await requireAuthUser(request);
    const { eventId } = await context.params;
    await assertEventAccess(session.userId, eventId);

    const availabilities = await prisma.eventAvailability.findMany({
      where: { eventId },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            email: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ availabilities });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load availability." },
      { status: 400 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ eventId: string }> },
) {
  try {
    const session = await requireAuthUser(request);
    const { eventId } = await context.params;
    await assertEventAccess(session.userId, eventId);

    const eventMeta = await prisma.event.findUnique({ where: { id: eventId }, select: { bandId: true } });
    if (!eventMeta) {
      throw new AuthError("Event not found.", 404);
    }
    await requireBandAction(session.userId, eventMeta.bandId, "availability.update");

    const payload = upsertSchema.parse(await request.json());

    const result = await prisma.eventAvailability.upsert({
      where: {
        eventId_userId: {
          eventId,
          userId: session.userId,
        },
      },
      create: {
        eventId,
        userId: session.userId,
        status: payload.status,
        note: payload.note ?? null,
      },
      update: {
        status: payload.status,
        note: payload.note ?? null,
      },
    });

    if (eventMeta) {
      await writeAuditLog({
        bandId: eventMeta.bandId,
        actorUserId: session.userId,
        action: "availability_updated",
        entityType: "event",
        entityId: eventId,
        payload: { status: payload.status },
      });
    }

    return NextResponse.json({ availability: result });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update availability." },
      { status: 400 },
    );
  }
}
