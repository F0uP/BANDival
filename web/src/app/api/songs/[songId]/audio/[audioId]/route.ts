import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertSongAccess, AuthError, requireAuthUser } from "@/lib/auth";

const updateAudioSchema = z.object({
  fileName: z.string().min(1).max(255).optional(),
  isCurrent: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ songId: string; audioId: string }> },
) {
  try {
    const session = await requireAuthUser(request);
    const { songId, audioId } = await context.params;
    await assertSongAccess(session.userId, songId);

    const payload = updateAudioSchema.parse(await request.json());
    if (payload.fileName === undefined && payload.isCurrent === undefined) {
      return NextResponse.json({ error: "No changes requested." }, { status: 400 });
    }

    const existing = await prisma.songAudioVersion.findFirst({
      where: { id: audioId, songId },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Audio version not found." }, { status: 404 });
    }

    const audioVersion = await prisma.$transaction(async (tx) => {
      if (payload.isCurrent) {
        await tx.songAudioVersion.updateMany({
          where: { songId, isCurrent: true },
          data: { isCurrent: false },
        });
      }

      return tx.songAudioVersion.update({
        where: { id: audioId },
        data: {
          fileName: payload.fileName,
          isCurrent: payload.isCurrent === true ? true : undefined,
        },
      });
    });

    return NextResponse.json({ audioVersion });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 400;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update audio version." },
      { status },
    );
  }
}
