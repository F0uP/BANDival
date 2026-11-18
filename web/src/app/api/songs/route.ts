import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseBandId } from "@/lib/api";
import { AuthError, requireAuthUser, requireBandAction, requireBandMembership, writeAuditLog } from "@/lib/auth";
import { errorResponse, json } from "@/lib/http";
import { notifyBandMembers } from "@/lib/notifications";
import { songInputSchema, songListSelect } from "@/lib/schemas";

const createSongSchema = songInputSchema.extend({ bandId: z.string().uuid() });

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const bandId = parseBandId(request.nextUrl.searchParams.get("bandId"));
    await requireBandMembership(session.userId, bandId);

    const songs = await prisma.song.findMany({
      where: { bandId },
      select: songListSelect,
      orderBy: { updatedAt: "desc" },
    });

    return json({ songs });
  } catch (error) {
    return errorResponse(error, "Songs konnten nicht geladen werden.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const parsed = createSongSchema.parse(await request.json());
    await requireBandAction(session.userId, parsed.bandId, "songs.create");

    if (parsed.albumId) {
      const album = await prisma.album.findFirst({ where: { id: parsed.albumId, bandId: parsed.bandId }, select: { id: true } });
      if (!album) {
        throw new AuthError("Album gehört nicht zu dieser Band.", 400);
      }
    }

    const song = await prisma.song.create({
      data: {
        bandId: parsed.bandId,
        title: parsed.title,
        workflowStatus: parsed.workflowStatus ?? "draft",
        albumId: parsed.albumId ?? null,
        albumTrackNo: parsed.albumTrackNo ?? null,
        keySignature: parsed.keySignature || null,
        tempoBpm: parsed.tempoBpm ?? null,
        durationSeconds: parsed.durationSeconds ?? null,
        timeSignature: parsed.timeSignature || null,
        isPublic: parsed.isPublic ?? false,
        spotifyUrl: parsed.spotifyUrl,
        notes: parsed.notes || null,
        chordProText: parsed.chordProText || null,
        createdBy: session.userId,
        lyricsRevisions: parsed.lyricsMarkdown
          ? { create: { revisionNumber: 1, lyricsMarkdown: parsed.lyricsMarkdown, title: "Initial", isCurrent: true } }
          : undefined,
      },
      select: songListSelect,
    });

    await writeAuditLog({
      bandId: parsed.bandId,
      actorUserId: session.userId,
      action: "song_created",
      entityType: "song",
      entityId: song.id,
      payload: { title: song.title, songId: song.id },
    });

    await notifyBandMembers({
      bandId: parsed.bandId,
      actorUserId: session.userId,
      kind: "song",
      type: "song_created",
      title: "Neuer Song",
      body: `„${parsed.title}“ wurde zur Bandbibliothek hinzugefügt.`,
      payload: { songId: song.id },
    });

    return json({ song }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Song konnte nicht erstellt werden.");
  }
}

