import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthError, requireAuthUser, requireBandAction, writeAuditLog } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse } from "@/lib/http";
import { getUploadRoot, resolveUploadPath } from "@/lib/storage";
import { queueTranscode } from "@/lib/audio";

export const runtime = "nodejs";

/** Turns an idea into a draft song – the recording becomes audio version 1. */
export async function POST(request: NextRequest, context: { params: Promise<{ ideaId: string }> }) {
  try {
    const session = await requireAuthUser(request);
    const ideaId = parseUuid((await context.params).ideaId, "Ideen-ID");
    const idea = await prisma.idea.findUnique({ where: { id: ideaId } });
    if (!idea) throw new AuthError("Idee nicht gefunden.", 404);
    await requireBandAction(session.userId, idea.bandId, "songs.create");
    if (idea.songId) return NextResponse.json({ songId: idea.songId });

    const song = await prisma.song.create({
      data: { bandId: idea.bandId, title: idea.title, workflowStatus: "draft", notes: idea.notes, createdBy: session.userId },
    });

    const source = idea.fileUrl ? resolveUploadPath(idea.fileUrl) : null;
    if (source) {
      const extension = path.extname(source) || ".webm";
      const directory = path.join(getUploadRoot(), "audio", song.id);
      await mkdir(directory, { recursive: true });
      const fileName = `${Date.now()}-${randomUUID()}${extension}`;
      await copyFile(source, path.join(directory, fileName));
      const fileUrl = `/uploads/audio/${song.id}/${fileName}`;
      // A memo whose conversion hasn't finished (or failed) gets converted again as a song recording.
      const convert = idea.mimeType !== "audio/mpeg";
      const version = await prisma.songAudioVersion.create({
        data: {
          songId: song.id,
          versionNumber: 1,
          fileUrl,
          fileName: idea.fileName ?? `idee${extension}`,
          mimeType: idea.mimeType ?? "audio/webm",
          originalFileUrl: fileUrl,
          originalMimeType: idea.mimeType,
          transcodeStatus: convert ? "pending" : null,
          durationSeconds: idea.durationSeconds,
          isCurrent: true,
        },
      });
      if (convert) queueTranscode({ kind: "audio", id: version.id });
    }
    await prisma.idea.update({ where: { id: idea.id }, data: { songId: song.id } });
    await writeAuditLog({ bandId: idea.bandId, actorUserId: session.userId, action: "song_created", entityType: "song", entityId: song.id, payload: { title: song.title, fromIdea: true } });
    return NextResponse.json({ songId: song.id }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Song konnte nicht angelegt werden.");
  }
}
