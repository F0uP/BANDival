import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertSongAccess, requireAuthUser } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse, HttpError } from "@/lib/http";
import { consumeRateLimit } from "@/lib/rate-limit";
import { clickTrackResponse } from "@/lib/click-track";

export const runtime = "nodejs";

/** Click track of one song (?countIn=0|1|2 bars). */
export async function GET(request: NextRequest, context: { params: Promise<{ songId: string }> }) {
  try {
    const session = await requireAuthUser(request);
    const songId = parseUuid((await context.params).songId, "Song-ID");
    await assertSongAccess(session.userId, songId, { allowGuest: true });
    await consumeRateLimit(`click:${session.userId}`, 60, 60 * 60 * 1000);
    const song = await prisma.song.findUnique({ where: { id: songId }, select: { title: true, tempoBpm: true, timeSignature: true, durationSeconds: true } });
    if (!song) throw new HttpError("Song nicht gefunden.", 404);
    if (!song.tempoBpm) throw new HttpError("Für diesen Song ist kein Tempo hinterlegt.", 400);
    const countInBars = Math.min(2, Math.max(0, Number(request.nextUrl.searchParams.get("countIn") ?? 1) || 0));
    return await clickTrackResponse(
      [{ title: song.title, bpm: Number(song.tempoBpm), timeSignature: song.timeSignature, durationSeconds: song.durationSeconds }],
      { countInBars, gapSeconds: 0, fileName: `${song.title}-click-${Math.round(Number(song.tempoBpm))}bpm` },
    );
  } catch (error) {
    return errorResponse(error, "Click-Track konnte nicht erstellt werden.");
  }
}
