import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuthUser, requireBandAction } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse } from "@/lib/http";
import { assertEventsOfBand, loadTourForUser } from "@/lib/tours";

/** Sets which calendar events belong to the tour (events stay in the calendar either way). */
export async function PUT(request: NextRequest, context: { params: Promise<{ tourId: string }> }) {
  try {
    const session = await requireAuthUser(request);
    const { tour } = await loadTourForUser(parseUuid((await context.params).tourId, "Tour-ID"), session.userId);
    await requireBandAction(session.userId, tour.bandId, "events.manage");
    const { eventIds } = z.object({ eventIds: z.array(z.string().uuid()).max(200) }).parse(await request.json());
    await assertEventsOfBand(tour.bandId, eventIds);
    await prisma.$transaction([
      prisma.event.updateMany({ where: { tourId: tour.id, id: { notIn: eventIds } }, data: { tourId: null } }),
      prisma.event.updateMany({ where: { bandId: tour.bandId, id: { in: eventIds } }, data: { tourId: tour.id } }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Termine konnten nicht zugeordnet werden.");
  }
}
