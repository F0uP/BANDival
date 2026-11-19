import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthUser, requireBandAction } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse } from "@/lib/http";
import { loadTourForUser, tourItemSchema } from "@/lib/tours";

/** Adds travel, accommodation, a meal, an appointment or a note to the tour. */
export async function POST(request: NextRequest, context: { params: Promise<{ tourId: string }> }) {
  try {
    const session = await requireAuthUser(request);
    const { tour } = await loadTourForUser(parseUuid((await context.params).tourId, "Tour-ID"), session.userId);
    await requireBandAction(session.userId, tour.bandId, "events.manage");
    const payload = tourItemSchema.parse(await request.json());
    const item = await prisma.tourItem.create({
      data: {
        tourId: tour.id, kind: payload.kind, title: payload.title, startsAt: new Date(payload.startsAt), endsAt: payload.endsAt ? new Date(payload.endsAt) : null,
        location: payload.location, toLocation: payload.toLocation, details: payload.details, bookingRef: payload.bookingRef,
        costCents: payload.costCents ?? null, distanceKm: payload.distanceKm ?? null,
      },
    });
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Eintrag konnte nicht gespeichert werden.");
  }
}
