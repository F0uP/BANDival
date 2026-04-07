import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseBandId } from "@/lib/api";
import { AuthError, requireAuthUser, requireBandMembership, writeAuditLog } from "@/lib/auth";

const getSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
});

const upsertSchema = z.object({
  bandId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["available", "maybe", "unavailable"]),
});

function toDayRange(dateIso: string) {
  const start = new Date(`${dateIso}T00:00:00.000Z`);
  const end = new Date(`${dateIso}T23:59:59.999Z`);
  return { start, end };
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const bandId = parseBandId(request.nextUrl.searchParams.get("bandId"));
    const parsed = getSchema.parse({ month: request.nextUrl.searchParams.get("month") ?? "" });
    await requireBandMembership(session.userId, bandId);

    const monthStart = new Date(`${parsed.month}-01T00:00:00.000Z`);
    const monthEnd = new Date(monthStart);
    monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);

    const [events, memberCount] = await Promise.all([
      prisma.event.findMany({
        where: {
          bandId,
          status: "availability_template",
          startsAt: {
            gte: monthStart,
            lt: monthEnd,
          },
        },
        include: { availabilities: true },
        orderBy: { startsAt: "asc" },
      }),
      prisma.bandMember.count({ where: { bandId } }),
    ]);

    const days = events.map((event) => {
      const availableCount = event.availabilities.filter((a) => a.status === "available").length;
      const maybeCount = event.availabilities.filter((a) => a.status === "maybe").length;
      const unavailableCount = event.availabilities.filter((a) => a.status === "unavailable").length;
      const myAvailability = event.availabilities.find((a) => a.userId === session.userId) ?? null;
      const date = event.startsAt.toISOString().slice(0, 10);

      return {
        date,
        eventId: event.id,
        myStatus: myAvailability?.status ?? null,
        summary: {
          availableCount,
          maybeCount,
          unavailableCount,
          missingResponses: Math.max(0, memberCount - event.availabilities.length),
          memberCount,
        },
      };
    });

    return NextResponse.json({ days });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load day availability." },
      { status: 400 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const payload = upsertSchema.parse(await request.json());
    await requireBandMembership(session.userId, payload.bandId);

    const { start, end } = toDayRange(payload.date);

    const existing = await prisma.event.findFirst({
      where: {
        bandId: payload.bandId,
        status: "availability_template",
        startsAt: { gte: start, lte: end },
      },
    });

    const event = existing
      ? existing
      : await prisma.event.create({
          data: {
            bandId: payload.bandId,
            title: `Verfuegbarkeit ${payload.date}`,
            startsAt: new Date(`${payload.date}T12:00:00.000Z`),
            status: "availability_template",
          },
        });

    const availability = await prisma.eventAvailability.upsert({
      where: {
        eventId_userId: {
          eventId: event.id,
          userId: session.userId,
        },
      },
      create: {
        eventId: event.id,
        userId: session.userId,
        status: payload.status,
      },
      update: {
        status: payload.status,
      },
    });

    await writeAuditLog({
      bandId: payload.bandId,
      actorUserId: session.userId,
      action: "day_availability_updated",
      entityType: "event",
      entityId: event.id,
      payload: { date: payload.date, status: payload.status },
    });

    return NextResponse.json({ eventId: event.id, availability });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update day availability." },
      { status: 400 },
    );
  }
}
