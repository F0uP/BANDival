import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertSongAccess, AuthError, requireAuthUser } from "@/lib/auth";

const updateAttachmentSchema = z.object({
  fileName: z.string().min(1).max(255),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ songId: string; attachmentId: string }> },
) {
  try {
    const session = await requireAuthUser(request);
    const { songId, attachmentId } = await context.params;
    await assertSongAccess(session.userId, songId);

    const payload = updateAttachmentSchema.parse(await request.json());

    const attachment = await prisma.songAttachment.findFirst({
      where: { id: attachmentId, songId },
      select: { id: true },
    });

    if (!attachment) {
      return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
    }

    const updatedAttachment = await prisma.songAttachment.update({
      where: { id: attachmentId },
      data: { fileName: payload.fileName },
    });

    return NextResponse.json({ attachment: updatedAttachment });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 400;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update attachment." },
      { status },
    );
  }
}
