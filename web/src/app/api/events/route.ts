import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseBandId } from "@/lib/api";
import { requireAuthUser, requireBandAction, requireBandMembership, writeAuditLog } from "@/lib/auth";

const createEventSchema = z.object({
  bandId: z.string().uuid(),
  title: z.string().min(1).max(200),
  startsAt: z.string(),
  endsAt: z.string().nullable().optional(),
  venueLabel: z.string().max(200).nullable().optional(),
  notes: z.string().max(3000).nullable().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const bandId = parseBandId(request.nextUrl.searchParams.get("bandId"));
    await requireBandMembership(session.userId, bandId);

    const [events, memberCount] = await Promise.all([
      prisma.event.findMany({
      where: { bandId },
      include: {
        availabilities: true,
      },
      orderBy: { startsAt: "asc" },
    }),
      prisma.bandMember.count({ where: { bandId } }),
    ]);

    const enrichedEvents = events.map((event) => {
      const availableCount = event.availabilities.filter((a) => a.status === "available").length;
      const maybeCount = event.availabilities.filter((a) => a.status === "maybe").length;
      const unavailableCount = event.availabilities.filter((a) => a.status === "unavailable").length;
      const myAvailability = event.availabilities.find((a) => a.userId === session.userId) ?? null;
      const missingResponses = Math.max(0, memberCount - event.availabilities.length);

      const hasConflict = unavailableCount > 0 || (availableCount === 0 && maybeCount > 0) || missingResponses > 0;
      const suggestionOffsets = [1, 2, 3, 7];
      const suggestedStartsAt = hasConflict
        ? suggestionOffsets.map((offset) => {
            const date = new Date(event.startsAt);
            date.setDate(date.getDate() + offset);
            return date.toISOString();
          })
        : [];

      return {
        ...event,
        myAvailability,
        availabilitySummary: {
          availableCount,
          maybeCount,
          unavailableCount,
          missingResponses,
          memberCount,
          hasConflict,
          suggestedStartsAt,
        },
      };
    });

    return NextResponse.json({ events: enrichedEvents });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch events." },
      { status: 400 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const payload = createEventSchema.parse(await request.json());
    await requireBandAction(session.userId, payload.bandId, "events.create");

    const event = await prisma.event.create({
      data: {
        bandId: payload.bandId,
        title: payload.title,
        startsAt: new Date(payload.startsAt),
        endsAt: payload.endsAt ? new Date(payload.endsAt) : null,
        venueLabel: payload.venueLabel ?? null,
        notes: payload.notes ?? null,
      },
    });

    await writeAuditLog({
      bandId: payload.bandId,
      actorUserId: session.userId,
      action: "event_created",
      entityType: "event",
      entityId: event.id,
      payload: { title: payload.title, startsAt: payload.startsAt },
    });

    return NextResponse.json({ event }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create event." },
      { status: 400 },
    );
  }
}
