import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertSongAccess, requireAuthUser, writeAuditLog } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse, HttpError } from "@/lib/http";
import { isAudioFile, MAX_AUDIO_BYTES, saveUpload } from "@/lib/storage";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ songId: string }> }) {
  try {
    const session = await requireAuthUser(request);
    const songId = parseUuid((await context.params).songId, "Song-ID");
    const { bandId } = await assertSongAccess(session.userId, songId);
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      throw new HttpError("Keine Audiodatei hochgeladen.", 400);
    }
    if (!isAudioFile(file)) {
      throw new HttpError("Nur Audiodateien (MP3, WAV, M4A, OGG, FLAC …) sind erlaubt.", 400);
    }

    const fileUrl = await saveUpload(file, "audio", songId, { maxBytes: MAX_AUDIO_BYTES, fallbackExtension: ".mp3" });
    const durationSeconds = Math.round(Number(formData.get("durationSeconds") ?? 0)) || null;

    const audioVersion = await prisma.$transaction(async (tx) => {
      const latest = await tx.songAudioVersion.findFirst({ where: { songId }, orderBy: { versionNumber: "desc" } });
      await tx.songAudioVersion.updateMany({ where: { songId, isCurrent: true }, data: { isCurrent: false } });
      const created = await tx.songAudioVersion.create({
        data: {
          songId,
          versionNumber: (latest?.versionNumber ?? 0) + 1,
          fileUrl,
          fileName: file.name.slice(0, 255),
          mimeType: file.type || "audio/mpeg",
          durationSeconds,
          isCurrent: true,
        },
      });
      // Take the duration from the recording if the song has none yet.
      if (durationSeconds) {
        await tx.song.updateMany({ where: { id: songId, durationSeconds: null }, data: { durationSeconds } });
      }
      await tx.song.update({ where: { id: songId }, data: { updatedAt: new Date() } });
      return created;
    });

    await writeAuditLog({
      bandId,
      actorUserId: session.userId,
      action: "audio_uploaded",
      entityType: "song",
      entityId: songId,
      payload: { songId, fileName: audioVersion.fileName, version: audioVersion.versionNumber },
    });

    return NextResponse.json({ audioVersion }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Audio-Upload fehlgeschlagen.");
  }
}
