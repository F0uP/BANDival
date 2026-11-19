import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthUser, requireBandAction, writeAuditLog } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse } from "@/lib/http";
import { dateRange, loadTourForUser, presentTour, tourDetail, tourInputSchema } from "@/lib/tours";

type Context = { params: Promise<{ tourId: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const { tour } = await loadTourForUser(parseUuid((await context.params).tourId, "Tour-ID"), session.userId);
    return NextResponse.json(await tourDetail(tour.id));
  } catch (error) {
    return errorResponse(error, "Tour konnte nicht geladen werden.");
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const { tour } = await loadTourForUser(parseUuid((await context.params).tourId, "Tour-ID"), session.userId);
    await requireBandAction(session.userId, tour.bandId, "events.manage");
    const payload = tourInputSchema.parse(await request.json());
    const updated = await prisma.tour.update({ where: { id: tour.id }, data: { name: payload.name, notes: payload.notes || null, ...dateRange(payload.startsOn, payload.endsOn) } });
    await writeAuditLog({ bandId: tour.bandId, actorUserId: session.userId, action: "tour_updated", entityType: "tour", entityId: tour.id, payload: { title: updated.name, url: `/app/tours/${tour.id}` } });
    return NextResponse.json({ tour: presentTour(updated) });
  } catch (error) {
    return errorResponse(error, "Tour konnte nicht gespeichert werden.");
  }
}

/** Deletes the tour with its travel/accommodation entries – the gigs stay in the calendar. */
export async function DELETE(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const { tour } = await loadTourForUser(parseUuid((await context.params).tourId, "Tour-ID"), session.userId);
    await requireBandAction(session.userId, tour.bandId, "events.manage");
    await prisma.tour.delete({ where: { id: tour.id } });
    await writeAuditLog({ bandId: tour.bandId, actorUserId: session.userId, action: "tour_deleted", entityType: "tour", entityId: tour.id, payload: { title: tour.name } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Tour konnte nicht gelöscht werden.");
  }
}
