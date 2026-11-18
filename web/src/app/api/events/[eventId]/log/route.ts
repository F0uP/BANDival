import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertEventAccess, assertSongsInBand, requireAuthUser, requireBandAction, writeAuditLog } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse, HttpError, json } from "@/lib/http";

const schema = z.object({
  notes: z.string().max(20000).optional(),
  songs: z.array(z.object({
    songId: z.string().uuid(),
    rating: z.number().int().min(1).max(5).nullable().optional(),
    note: z.string().trim().max(500).nullable().optional(),
  })).max(100).optional(),
  attendance: z.array(z.object({ userId: z.string().uuid(), present: z.boolean() })).max(100).optional(),
});

/** Rehearsal/gig protocol: notes, songs played (with rating) and attendance. */
export async function PUT(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  try {
    const session = await requireAuthUser(request);
    const eventId = parseUuid((await context.params).eventId, "Termin-ID");
    const { bandId } = await assertEventAccess(session.userId, eventId);
    await requireBandAction(session.userId, bandId, "events.log");
    const payload = schema.parse(await request.json());
    if (payload.songs) await assertSongsInBand(bandId, payload.songs.map((song) => song.songId));
    if (payload.attendance) {
      const members = await prisma.bandMember.count({ where: { bandId, userId: { in: payload.attendance.map((entry) => entry.userId) } } });
      if (members !== new Set(payload.attendance.map((entry) => entry.userId)).size) throw new HttpError("Unbekanntes Mitglied in der Anwesenheit.", 400);
    }

    await prisma.$transaction(async (tx) => {
      if (payload.notes !== undefined) {
        await tx.eventLog.upsert({
          where: { eventId },
          create: { eventId, notes: payload.notes, updatedByUserId: session.userId },
          update: { notes: payload.notes, updatedByUserId: session.userId },
        });
      }
      if (payload.songs) {
        await tx.eventLogSong.deleteMany({ where: { eventId, songId: { notIn: payload.songs.map((song) => song.songId) } } });
        for (const song of payload.songs) {
          await tx.eventLogSong.upsert({
            where: { eventId_songId: { eventId, songId: song.songId } },
            create: { eventId, songId: song.songId, rating: song.rating ?? null, note: song.note || null },
            update: { rating: song.rating ?? null, note: song.note || null },
          });
        }
      }
      if (payload.attendance) {
        for (const entry of payload.attendance) {
          await tx.eventAttendance.upsert({
            where: { eventId_userId: { eventId, userId: entry.userId } },
            create: { eventId, userId: entry.userId, present: entry.present },
            update: { present: entry.present },
          });
        }
      }
    });
    await writeAuditLog({ bandId, actorUserId: session.userId, action: "event_protocol_updated", entityType: "event", entityId: eventId });
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Protokoll konnte nicht gespeichert werden.");
  }
}
