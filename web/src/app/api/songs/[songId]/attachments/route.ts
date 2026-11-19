import { NextRequest } from "next/server";
import { AttachmentKind } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { assertSongAccess, requireAuthUser, writeAuditLog } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse, HttpError, json } from "@/lib/http";
import { MAX_ATTACHMENT_BYTES, saveUpload } from "@/lib/storage";

export const runtime = "nodejs";

const KINDS = new Set<AttachmentKind>(["lead_sheet", "score_pdf", "score_musicxml", "score_image", "lyrics_doc", "other"]);

function guessKind(fileName: string): AttachmentKind {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".musicxml") || lower.endsWith(".mxl") || lower.endsWith(".xml")) return "score_musicxml";
  if (lower.endsWith(".pdf")) return "score_pdf";
  if (/\.(png|jpe?g|webp|gif)$/.test(lower)) return "score_image";
  if (/\.(txt|docx?|md|cho|chordpro)$/.test(lower)) return "lyrics_doc";
  return "other";
}

export async function POST(request: NextRequest, context: { params: Promise<{ songId: string }> }) {
  try {
    const session = await requireAuthUser(request);
    const songId = parseUuid((await context.params).songId, "Song-ID");
    const { bandId } = await assertSongAccess(session.userId, songId);
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      throw new HttpError("Keine Datei hochgeladen.", 400);
    }

    const requestedKind = formData.get("kind")?.toString() as AttachmentKind | undefined;
    const kind = requestedKind && KINDS.has(requestedKind) && requestedKind !== "other" ? requestedKind : guessKind(file.name);
    const fileUrl = await saveUpload(file, "songs", songId, { maxBytes: MAX_ATTACHMENT_BYTES });

    const attachment = await prisma.songAttachment.create({
      data: {
        songId,
        kind,
        fileUrl,
        fileName: file.name.slice(0, 255),
        mimeType: file.type || null,
        fileSizeBytes: BigInt(file.size),
      },
    });
    await prisma.song.update({ where: { id: songId }, data: { updatedAt: new Date() } });

    await writeAuditLog({
      bandId,
      actorUserId: session.userId,
      action: "attachment_uploaded",
      entityType: "song",
      entityId: songId,
      payload: { songId, fileName: attachment.fileName, kind },
    });

    return json({ attachment }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Upload fehlgeschlagen.");
  }
}
