import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AuthError, assertSongAccess, requireAuthUser, writeAuditLog } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse } from "@/lib/http";
import { deleteUpload } from "@/lib/storage";

const updateAudioSchema = z.object({
  fileName: z.string().trim().min(1).max(255).optional(),
  isCurrent: z.literal(true).optional(),
});

type Context = { params: Promise<{ songId: string; audioId: string }> };

async function resolve(request: NextRequest, context: Context) {
  const session = await requireAuthUser(request);
  const params = await context.params;
  const songId = parseUuid(params.songId, "Song-ID");
  const audioId = parseUuid(params.audioId, "Audio-ID");
  const { bandId } = await assertSongAccess(session.userId, songId);
  const audio = await prisma.songAudioVersion.findFirst({ where: { id: audioId, songId } });
  if (!audio) {
    throw new AuthError("Audioversion nicht gefunden.", 404);
  }
  return { session, songId, bandId, audio };
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const { songId, audio } = await resolve(request, context);
    const payload = updateAudioSchema.parse(await request.json());

    const audioVersion = await prisma.$transaction(async (tx) => {
      if (payload.isCurrent) {
        await tx.songAudioVersion.updateMany({ where: { songId, isCurrent: true }, data: { isCurrent: false } });
      }
      return tx.songAudioVersion.update({
        where: { id: audio.id },
        data: { fileName: payload.fileName, isCurrent: payload.isCurrent },
      });
    });

    return NextResponse.json({ audioVersion });
  } catch (error) {
    return errorResponse(error, "Audioversion konnte nicht aktualisiert werden.");
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    const { session, songId, bandId, audio } = await resolve(request, context);

    await prisma.$transaction(async (tx) => {
      await tx.songAudioVersion.delete({ where: { id: audio.id } });
      if (audio.isCurrent) {
        const newest = await tx.songAudioVersion.findFirst({ where: { songId }, orderBy: { versionNumber: "desc" } });
        if (newest) {
          await tx.songAudioVersion.update({ where: { id: newest.id }, data: { isCurrent: true } });
        }
      }
    });
    await deleteUpload(audio.fileUrl);

    await writeAuditLog({
      bandId,
      actorUserId: session.userId,
      action: "audio_deleted",
      entityType: "song",
      entityId: songId,
      payload: { songId, fileName: audio.fileName },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Audioversion konnte nicht gelöscht werden.");
  }
}
