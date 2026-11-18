import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AuthError, assertSongAccess, requireAuthUser, writeAuditLog } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse, json } from "@/lib/http";
import { deleteUpload } from "@/lib/storage";

const updateAttachmentSchema = z.object({
  fileName: z.string().trim().min(1).max(255).optional(),
  kind: z.enum(["lead_sheet", "score_pdf", "score_musicxml", "score_image", "lyrics_doc", "other"]).optional(),
});

type Context = { params: Promise<{ songId: string; attachmentId: string }> };

async function resolve(request: NextRequest, context: Context) {
  const session = await requireAuthUser(request);
  const params = await context.params;
  const songId = parseUuid(params.songId, "Song-ID");
  const attachmentId = parseUuid(params.attachmentId, "Datei-ID");
  const { bandId } = await assertSongAccess(session.userId, songId);
  const attachment = await prisma.songAttachment.findFirst({ where: { id: attachmentId, songId } });
  if (!attachment) {
    throw new AuthError("Datei nicht gefunden.", 404);
  }
  return { session, songId, bandId, attachment };
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const { attachment } = await resolve(request, context);
    const payload = updateAttachmentSchema.parse(await request.json());
    const updated = await prisma.songAttachment.update({ where: { id: attachment.id }, data: payload });
    return json({ attachment: updated });
  } catch (error) {
    return errorResponse(error, "Datei konnte nicht aktualisiert werden.");
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    const { session, songId, bandId, attachment } = await resolve(request, context);
    await prisma.songAttachment.delete({ where: { id: attachment.id } });
    await deleteUpload(attachment.fileUrl);

    await writeAuditLog({
      bandId,
      actorUserId: session.userId,
      action: "attachment_deleted",
      entityType: "song",
      entityId: songId,
      payload: { songId, fileName: attachment.fileName },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Datei konnte nicht gelöscht werden.");
  }
}
