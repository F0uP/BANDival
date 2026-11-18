import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuthUser, requireBandAction, writeAuditLog } from "@/lib/auth";
import { errorResponse } from "@/lib/http";

const songSchema = z.object({
  title: z.string().trim().min(1).max(200),
  keySignature: z.string().trim().max(20).nullable().optional(),
  tempoBpm: z.number().min(20).max(400).nullable().optional(),
  durationSeconds: z.number().int().min(1).max(36000).nullable().optional(),
  timeSignature: z.string().trim().regex(/^\d{1,2}\/(1|2|4|8|16)$/).nullable().optional(),
  chordProText: z.string().max(50000).nullable().optional(),
  spotifyUrl: z.string().url().max(500).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

const schema = z.object({
  bandId: z.string().uuid(),
  songs: z.array(songSchema).min(1).max(300),
  skipExisting: z.boolean().default(true),
});

/** Bulk import (ChordPro files, title lists, Spotify playlists). Existing titles are skipped by default. */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const payload = schema.parse(await request.json());
    await requireBandAction(session.userId, payload.bandId, "songs.create");
    const existing = new Set((await prisma.song.findMany({ where: { bandId: payload.bandId }, select: { title: true } })).map((song) => song.title.trim().toLowerCase()));
    const seen = new Set<string>();
    const toCreate = payload.songs.filter((song) => {
      const key = song.title.trim().toLowerCase();
      if (seen.has(key) || (payload.skipExisting && existing.has(key))) return false;
      seen.add(key);
      return true;
    });
    await prisma.$transaction(toCreate.map((song) => prisma.song.create({
      data: {
        bandId: payload.bandId,
        title: song.title,
        keySignature: song.keySignature || null,
        tempoBpm: song.tempoBpm ?? null,
        durationSeconds: song.durationSeconds ?? null,
        timeSignature: song.timeSignature || null,
        chordProText: song.chordProText || null,
        spotifyUrl: song.spotifyUrl || null,
        notes: song.notes || null,
        createdBy: session.userId,
      },
      select: { id: true },
    })));
    await writeAuditLog({ bandId: payload.bandId, actorUserId: session.userId, action: "songs_imported", entityType: "song", payload: { count: toCreate.length } });
    return NextResponse.json({ created: toCreate.length, skipped: payload.songs.length - toCreate.length }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Import fehlgeschlagen.");
  }
}
