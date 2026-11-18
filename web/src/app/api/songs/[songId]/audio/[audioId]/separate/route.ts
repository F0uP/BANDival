import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthError, assertSongAccess, requireAuthUser, writeAuditLog } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse } from "@/lib/http";
import { consumeRateLimit } from "@/lib/rate-limit";
import { refreshStemJob, startStemSeparation } from "@/lib/stem-separation";

export const runtime = "nodejs";

type Context = { params: Promise<{ songId: string; audioId: string }> };

async function load(request: NextRequest, context: Context) {
  const session = await requireAuthUser(request);
  const params = await context.params;
  const songId = parseUuid(params.songId, "Song-ID");
  const audioId = parseUuid(params.audioId, "Audio-ID");
  const { bandId } = await assertSongAccess(session.userId, songId);
  const audio = await prisma.songAudioVersion.findFirst({ where: { id: audioId, songId } });
  if (!audio) throw new AuthError("Aufnahme nicht gefunden.", 404);
  return { session, songId, bandId, audio };
}

/** Status of the latest separation job for this recording (advances the job while polling). */
export async function GET(request: NextRequest, context: Context) {
  try {
    const { audio } = await load(request, context);
    const latest = await prisma.aiJob.findFirst({ where: { kind: "stem_separation", audioVersionId: audio.id }, orderBy: { createdAt: "desc" } });
    const job = latest ? await refreshStemJob(latest.id) : null;
    return NextResponse.json({ job: job ? { id: job.id, status: job.status, error: job.error, result: job.result, createdAt: job.createdAt } : null });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Starts splitting the recording into stems (vocals, drums, bass, other). */
export async function POST(request: NextRequest, context: Context) {
  try {
    const { session, songId, bandId, audio } = await load(request, context);
    await consumeRateLimit(`stems:${bandId}`, 10, 24 * 60 * 60 * 1000);
    const job = await startStemSeparation({
      bandId,
      userId: session.userId,
      songId,
      audioVersionId: audio.id,
      fileUrl: audio.fileUrl,
      fileName: audio.fileName,
      mimeType: audio.mimeType || "audio/mpeg",
    });
    await writeAuditLog({ bandId, actorUserId: session.userId, action: "stems_requested", entityType: "song", entityId: songId, payload: { songId, fileName: audio.fileName } });
    return NextResponse.json({ job: { id: job.id, status: job.status } }, { status: 202 });
  } catch (error) {
    return errorResponse(error, "Spurtrennung konnte nicht gestartet werden.");
  }
}
