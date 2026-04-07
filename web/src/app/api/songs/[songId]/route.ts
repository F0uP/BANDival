import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertSongAccess, requireAuthUser, writeAuditLog } from "@/lib/auth";

const updateSongSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  workflowStatus: z.enum(["draft", "review", "approved", "archived"]).optional(),
  albumId: z.string().uuid().nullable().optional(),
  albumTrackNo: z.number().int().min(1).max(999).nullable().optional(),
  keySignature: z.string().max(20).nullable().optional(),
  tempoBpm: z.number().min(20).max(400).nullable().optional(),
  durationSeconds: z.number().int().min(1).max(36000).nullable().optional(),
  spotifyUrl: z.string().url().nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  chordProText: z.string().max(50000).nullable().optional(),
  lyricsMarkdown: z.string().max(20000).nullable().optional(),
});

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ songId: string }> },
) {
  const session = await requireAuthUser(request);
  const { songId } = await context.params;
  await assertSongAccess(session.userId, songId);

  const song = await prisma.song.findUnique({
    where: { id: songId },
    include: {
      album: true,
      audioVersions: { orderBy: { uploadedAt: "desc" } },
      attachments: { orderBy: { createdAt: "desc" } },
      lyricsRevisions: { orderBy: { revisionNumber: "desc" } },
      threads: {
        orderBy: { updatedAt: "desc" },
        include: {
          posts: {
            orderBy: { createdAt: "asc" },
          },
        },
      },
      setlistItems: {
        include: {
          setlist: true,
        },
      },
    },
  });

  if (!song) {
    return NextResponse.json({ error: "Song not found." }, { status: 404 });
  }

  return NextResponse.json({ song });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ songId: string }> },
) {
  try {
    const session = await requireAuthUser(request);
    const { songId } = await context.params;
    await assertSongAccess(session.userId, songId);
    const payload = updateSongSchema.parse(await request.json());

    const beforeSong = await prisma.song.findUnique({
      where: { id: songId },
      select: {
        id: true,
        bandId: true,
        title: true,
        workflowStatus: true,
        albumId: true,
        albumTrackNo: true,
        keySignature: true,
        tempoBpm: true,
        durationSeconds: true,
        spotifyUrl: true,
        notes: true,
        chordProText: true,
      },
    });

    if (!beforeSong) {
      return NextResponse.json({ error: "Song not found." }, { status: 404 });
    }

    if (payload.lyricsMarkdown !== undefined) {
      const current = await prisma.songLyricsRevision.findFirst({
        where: { songId, isCurrent: true },
        orderBy: { revisionNumber: "desc" },
      });

      await prisma.$transaction(async (tx) => {
        if (current) {
          await tx.songLyricsRevision.update({
            where: { id: current.id },
            data: { isCurrent: false },
          });
        }

        await tx.songLyricsRevision.create({
          data: {
            songId,
            revisionNumber: (current?.revisionNumber ?? 0) + 1,
            title: `Revision ${(current?.revisionNumber ?? 0) + 1}`,
            lyricsMarkdown: payload.lyricsMarkdown ?? "",
            isCurrent: true,
          },
        });
      });
    }

    const song = await prisma.song.update({
      where: { id: songId },
      data: {
        title: payload.title,
        workflowStatus: payload.workflowStatus,
        albumId: payload.albumId,
        albumTrackNo: payload.albumTrackNo,
        keySignature: payload.keySignature,
        tempoBpm: payload.tempoBpm,
        durationSeconds: payload.durationSeconds,
        spotifyUrl: payload.spotifyUrl,
        notes: payload.notes,
        chordProText: payload.chordProText,
      },
      include: {
        album: true,
        lyricsRevisions: {
          where: { isCurrent: true },
          take: 1,
        },
      },
    });

    const changed = Object.entries(payload).map(([field, next]) => ({
      field,
      before: (beforeSong as Record<string, unknown>)[field],
      after: next,
    }));

    if (changed.length > 0) {
      await writeAuditLog({
        bandId: beforeSong.bandId,
        actorUserId: session.userId,
        action: "song_updated",
        entityType: "song",
        entityId: songId,
        payload: { changed: JSON.parse(JSON.stringify(changed)) as Prisma.InputJsonValue },
      });
    }

    return NextResponse.json({ song });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update song." },
      { status: 400 },
    );
  }
}
