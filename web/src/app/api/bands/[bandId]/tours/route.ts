import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthUser, requireBandAction, requireBandMembership, writeAuditLog } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse } from "@/lib/http";
import { dateRange, presentTour, tourInputSchema } from "@/lib/tours";

type Context = { params: Promise<{ bandId: string }> };

/** Tours of the band, newest first – with gig count, distance and costs. */
export async function GET(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const bandId = parseUuid((await context.params).bandId, "Band-ID");
    await requireBandMembership(session.userId, bandId);
    const tours = await prisma.tour.findMany({
      where: { bandId },
      orderBy: { startsOn: "desc" },
      include: {
        events: { where: { kind: "gig", status: { not: "cancelled" } }, select: { id: true, venueLabel: true } },
        items: { select: { distanceKm: true, costCents: true } },
      },
    });
    return NextResponse.json({
      tours: tours.map(({ events, items, ...tour }) => ({
        ...presentTour(tour),
        gigs: events.length,
        venues: events.map((event) => event.venueLabel).filter(Boolean).slice(0, 4),
        distanceKm: items.reduce((sum, item) => sum + (item.distanceKm ?? 0), 0),
        costCents: items.reduce((sum, item) => sum + (item.costCents ?? 0), 0),
      })),
    });
  } catch (error) {
    return errorResponse(error, "Touren konnten nicht geladen werden.");
  }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const bandId = parseUuid((await context.params).bandId, "Band-ID");
    await requireBandAction(session.userId, bandId, "events.manage");
    const payload = tourInputSchema.parse(await request.json());
    const range = dateRange(payload.startsOn, payload.endsOn);
    const tour = await prisma.$transaction(async (tx) => {
      const created = await tx.tour.create({ data: { bandId, name: payload.name, notes: payload.notes || null, ...range } });
      // Gigs already in the calendar for this period become part of the tour right away.
      await tx.event.updateMany({
        where: { bandId, kind: "gig", tourId: null, startsAt: { gte: range.startsOn, lt: new Date(range.endsOn.getTime() + 86_400_000) } },
        data: { tourId: created.id },
      });
      return created;
    });
    await writeAuditLog({ bandId, actorUserId: session.userId, action: "tour_created", entityType: "tour", entityId: tour.id, payload: { title: tour.name, url: `/app/tours/${tour.id}` } });
    return NextResponse.json({ tour: presentTour(tour) }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Tour konnte nicht angelegt werden.");
  }
}
