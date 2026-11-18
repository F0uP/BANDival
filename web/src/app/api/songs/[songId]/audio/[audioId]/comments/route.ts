import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AuthError, assertSongAccess, requireAuthUser } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse } from "@/lib/http";
import { notifyBandMembers } from "@/lib/notifications";

const createSchema = z.object({
  atSeconds: z.number().min(0).max(36000),
  body: z.string().trim().min(1, "Bitte einen Kommentar eingeben.").max(2000),
});

type Context = { params: Promise<{ songId: string; audioId: string }> };

const commentSelect = {
  id: true, atSeconds: true, body: true, resolvedAt: true, createdAt: true,
  user: { select: { id: true, displayName: true, avatarUrl: true } },
} as const;

async function load(request: NextRequest, context: Context) {
  const session = await requireAuthUser(request);
  const params = await context.params;
  const songId = parseUuid(params.songId, "Song-ID");
  const audioId = parseUuid(params.audioId, "Audio-ID");
  const { bandId } = await assertSongAccess(session.userId, songId);
  const audio = await prisma.songAudioVersion.findFirst({ where: { id: audioId, songId }, select: { id: true, versionNumber: true, song: { select: { title: true } } } });
  if (!audio) throw new AuthError("Aufnahme nicht gefunden.", 404);
  return { session, songId, bandId, audio };
}

export async function GET(request: NextRequest, context: Context) {
  try {
    const { audio } = await load(request, context);
    const comments = await prisma.audioComment.findMany({ where: { audioVersionId: audio.id }, orderBy: { atSeconds: "asc" }, select: commentSelect });
    return NextResponse.json({ comments });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const { session, songId, bandId, audio } = await load(request, context);
    const payload = createSchema.parse(await request.json());
    const comment = await prisma.audioComment.create({
      data: { audioVersionId: audio.id, userId: session.userId, atSeconds: payload.atSeconds, body: payload.body },
      select: commentSelect,
    });
    const minutes = Math.floor(payload.atSeconds / 60);
    const seconds = String(Math.floor(payload.atSeconds % 60)).padStart(2, "0");
    await notifyBandMembers({
      bandId,
      actorUserId: session.userId,
      kind: "song",
      type: "audio_comment",
      title: `Kommentar zu „${audio.song.title}“ bei ${minutes}:${seconds}`,
      body: payload.body.slice(0, 200),
      payload: { songId, url: `/app/songs/${songId}?tab=files&audio=${audio.id}&t=${Math.floor(payload.atSeconds)}` },
    });
    return NextResponse.json({ comment }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Kommentar konnte nicht gespeichert werden.");
  }
}
