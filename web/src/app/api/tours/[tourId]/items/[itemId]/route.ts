import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthUser, requireBandAction } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse, HttpError } from "@/lib/http";
import { loadTourForUser, tourItemSchema } from "@/lib/tours";

type Context = { params: Promise<{ tourId: string; itemId: string }> };

async function load(request: NextRequest, context: Context) {
  const session = await requireAuthUser(request);
  const params = await context.params;
  const { tour } = await loadTourForUser(parseUuid(params.tourId, "Tour-ID"), session.userId);
  await requireBandAction(session.userId, tour.bandId, "events.manage");
  const item = await prisma.tourItem.findFirst({ where: { id: parseUuid(params.itemId, "Eintrags-ID"), tourId: tour.id } });
  if (!item) throw new HttpError("Eintrag nicht gefunden.", 404);
  return item;
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const item = await load(request, context);
    const payload = tourItemSchema.parse(await request.json());
    const updated = await prisma.tourItem.update({
      where: { id: item.id },
      data: {
        kind: payload.kind, title: payload.title, startsAt: new Date(payload.startsAt), endsAt: payload.endsAt ? new Date(payload.endsAt) : null,
        location: payload.location, toLocation: payload.toLocation, details: payload.details, bookingRef: payload.bookingRef,
        costCents: payload.costCents ?? null, distanceKm: payload.distanceKm ?? null,
      },
    });
    return NextResponse.json({ item: updated });
  } catch (error) {
    return errorResponse(error, "Eintrag konnte nicht gespeichert werden.");
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    const item = await load(request, context);
    await prisma.tourItem.delete({ where: { id: item.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
