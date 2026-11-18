import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AuthError, assertEventAccess, requireAuthUser, requireBandAction, writeAuditLog } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse, json } from "@/lib/http";
import { notifyBandMembers } from "@/lib/notifications";
import { assertSetlistInBand, eventFieldsSchema, loadEnrichedEvents } from "@/lib/events";

const patchSchema = eventFieldsSchema.partial().extend({
  scope: z.enum(["single", "series"]).default("single"),
});

type Context = { params: Promise<{ eventId: string }> };

async function resolve(request: NextRequest, context: Context) {
  const session = await requireAuthUser(request);
  const eventId = parseUuid((await context.params).eventId, "Termin-ID");
  const { bandId } = await assertEventAccess(session.userId, eventId);
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event || event.status === "availability_template") {
    throw new AuthError("Termin nicht gefunden.", 404);
  }
  const band = await prisma.band.findUnique({ where: { id: bandId }, select: { timezone: true } });
  return { session, eventId, bandId, event, timeZone: band?.timezone ?? "Europe/Berlin" };
}

export async function GET(request: NextRequest, context: Context) {
  try {
    const { session, eventId, bandId, event, timeZone } = await resolve(request, context);
    const enriched = (await loadEnrichedEvents({
      bandId,
      timeZone,
      userId: session.userId,
      from: event.startsAt,
      to: new Date(event.startsAt.getTime() + 1),
    })).find((entry) => entry.id === eventId);
    if (!enriched) {
      throw new AuthError("Termin nicht gefunden.", 404);
    }
    return json({ event: enriched });
  } catch (error) {
    return errorResponse(error, "Termin konnte nicht geladen werden.");
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const { session, eventId, bandId, event, timeZone } = await resolve(request, context);
    await requireBandAction(session.userId, bandId, "events.manage");
    const { scope, ...payload } = patchSchema.parse(await request.json());
    await assertSetlistInBand(bandId, payload.setlistId);

    const startsAt = payload.startsAt ? new Date(payload.startsAt) : event.startsAt;
    const endsAt = payload.endsAt === undefined ? event.endsAt : payload.endsAt ? new Date(payload.endsAt) : null;
    if (endsAt && endsAt <= startsAt) {
      throw new AuthError("Das Ende muss nach dem Beginn liegen.", 400);
    }

    const shared = {
      title: payload.title,
      kind: payload.kind,
      status: payload.status,
      venueLabel: payload.venueLabel === undefined ? undefined : payload.venueLabel || null,
      notes: payload.notes === undefined ? undefined : payload.notes || null,
      setlistId: payload.setlistId === undefined ? undefined : payload.setlistId,
    };

    await prisma.$transaction(async (tx) => {
      if (scope === "series" && event.recurrenceGroupId) {
        // Times are only changed for this occurrence; shared fields apply to the whole series.
        await tx.event.updateMany({ where: { recurrenceGroupId: event.recurrenceGroupId, bandId }, data: shared });
      }
      await tx.event.update({ where: { id: eventId }, data: { ...shared, startsAt, endsAt } });
    });

    const timeChanged = startsAt.getTime() !== event.startsAt.getTime();
    const cancelled = payload.status === "cancelled" && event.status !== "cancelled";
    await writeAuditLog({
      bandId,
      actorUserId: session.userId,
      action: cancelled ? "event_cancelled" : "event_updated",
      entityType: "event",
      entityId: eventId,
      payload: { title: payload.title ?? event.title, scope },
    });

    if (cancelled || timeChanged) {
      const dateLabel = startsAt.toLocaleString("de-DE", { timeZone, dateStyle: "medium", timeStyle: "short" });
      await notifyBandMembers({
        bandId,
        actorUserId: session.userId,
        kind: "event",
        type: cancelled ? "event_cancelled" : "event_moved",
        title: cancelled ? `Abgesagt: ${payload.title ?? event.title}` : `Verschoben: ${payload.title ?? event.title}`,
        body: cancelled ? `Der Termin am ${dateLabel} findet nicht statt.` : `Neuer Zeitpunkt: ${dateLabel}.`,
        payload: { eventId },
      });
    }

    const enriched = (await loadEnrichedEvents({ bandId, timeZone, userId: session.userId, from: startsAt, to: new Date(startsAt.getTime() + 1) }))
      .find((entry) => entry.id === eventId);
    return json({ event: enriched ?? null });
  } catch (error) {
    return errorResponse(error, "Termin konnte nicht gespeichert werden.");
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    const { session, eventId, bandId, event, timeZone } = await resolve(request, context);
    await requireBandAction(session.userId, bandId, "events.manage");
    const scope = request.nextUrl.searchParams.get("scope");

    let deleted = 1;
    if ((scope === "series" || scope === "following") && event.recurrenceGroupId) {
      const result = await prisma.event.deleteMany({
        where: {
          bandId,
          recurrenceGroupId: event.recurrenceGroupId,
          ...(scope === "following" ? { startsAt: { gte: event.startsAt } } : {}),
        },
      });
      deleted = result.count;
    } else {
      await prisma.event.delete({ where: { id: eventId } });
    }

    await writeAuditLog({
      bandId,
      actorUserId: session.userId,
      action: "event_deleted",
      entityType: "event",
      entityId: eventId,
      payload: { title: event.title, count: deleted },
    });

    if (event.startsAt > new Date() && event.status !== "cancelled") {
      await notifyBandMembers({
        bandId,
        actorUserId: session.userId,
        kind: "event",
        type: "event_deleted",
        title: `Termin entfernt: ${event.title}`,
        body: deleted > 1
          ? `${deleted} Termine der Serie wurden entfernt.`
          : `Der Termin am ${event.startsAt.toLocaleString("de-DE", { timeZone, dateStyle: "medium", timeStyle: "short" })} wurde entfernt.`,
      });
    }

    return NextResponse.json({ ok: true, deleted });
  } catch (error) {
    return errorResponse(error, "Termin konnte nicht gelöscht werden.");
  }
}
