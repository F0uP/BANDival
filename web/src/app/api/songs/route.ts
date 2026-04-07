import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseBandId } from "@/lib/api";
import { requireAuthUser, requireBandAction, requireBandMembership } from "@/lib/auth";
import { notifyBandMembers } from "@/lib/notifications";

function toJsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, current) => (typeof current === "bigint" ? current.toString() : current)),
  ) as T;
}

const createSongSchema = z.object({
  bandId: z.string().uuid(),
  title: z.string().min(1).max(200),
  workflowStatus: z.enum(["draft", "review", "approved", "archived"]).optional(),
  albumId: z.string().uuid().optional().nullable(),
  albumTrackNo: z.number().int().min(1).max(999).optional().nullable(),
  keySignature: z.string().max(20).optional().nullable(),
  tempoBpm: z.number().min(20).max(400).optional().nullable(),
  durationSeconds: z.number().int().min(1).max(36000).optional().nullable(),
  spotifyUrl: z.string().url().optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  chordProText: z.string().max(50000).optional().nullable(),
  lyricsMarkdown: z.string().max(20000).optional().nullable(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const bandId = parseBandId(request.nextUrl.searchParams.get("bandId"));
    await requireBandMembership(session.userId, bandId);

    let songs;
    try {
      songs = await prisma.song.findMany({
        where: { bandId },
        include: {
          album: true,
          audioVersions: {
            where: { isCurrent: true },
            take: 1,
          },
          lyricsRevisions: {
            where: { isCurrent: true },
            take: 1,
          },
          attachments: {
            orderBy: { createdAt: "desc" },
          },
          threads: {
            include: {
              posts: {
                orderBy: { createdAt: "asc" },
              },
            },
            orderBy: { updatedAt: "desc" },
            take: 8,
          },
        },
        orderBy: { updatedAt: "desc" },
      });
    } catch {
      songs = await prisma.song.findMany({
        where: { bandId },
        include: {
          album: true,
          audioVersions: {
            where: { isCurrent: true },
            take: 1,
          },
          lyricsRevisions: {
            where: { isCurrent: true },
            take: 1,
          },
          attachments: {
            orderBy: { createdAt: "desc" },
          },
          threads: {
            include: {
              posts: {
                orderBy: { createdAt: "asc" },
              },
            },
            orderBy: { updatedAt: "desc" },
            take: 8,
          },
        },
        orderBy: { updatedAt: "desc" },
      });
    }

    return NextResponse.json({ songs: toJsonSafe(songs) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch songs." },
      { status: 400 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const body = await request.json();
    const parsed = createSongSchema.parse(body);
    await requireBandAction(session.userId, parsed.bandId, "songs.create");

    const song = await prisma.song.create({
      data: {
        bandId: parsed.bandId,
        title: parsed.title,
        workflowStatus: parsed.workflowStatus ?? "draft",
        albumId: parsed.albumId ?? null,
        albumTrackNo: parsed.albumTrackNo ?? null,
        keySignature: parsed.keySignature ?? null,
        tempoBpm: parsed.tempoBpm ?? null,
        durationSeconds: parsed.durationSeconds ?? null,
        spotifyUrl: parsed.spotifyUrl ?? null,
        notes: parsed.notes ?? null,
        chordProText: parsed.chordProText ?? null,
        lyricsRevisions: parsed.lyricsMarkdown
          ? {
              create: {
                revisionNumber: 1,
                lyricsMarkdown: parsed.lyricsMarkdown,
                title: "Initial",
                isCurrent: true,
              },
            }
          : undefined,
      },
      include: {
        album: true,
        lyricsRevisions: {
          where: { isCurrent: true },
          take: 1,
        },
      },
    });

    await notifyBandMembers({
      bandId: parsed.bandId,
      actorUserId: session.userId,
      kind: "song",
      type: "song_created",
      title: "Neuer Song",
      body: `${parsed.title} wurde zur Bandbibliothek hinzugefuegt.`,
      payload: { songId: song.id },
    });

    return NextResponse.json({ song }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create song." },
      { status: 400 },
    );
  }
}
