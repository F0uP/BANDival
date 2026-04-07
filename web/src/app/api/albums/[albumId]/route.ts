import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertAlbumAccess, requireAuthUser, writeAuditLog } from "@/lib/auth";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ albumId: string }> },
) {
  try {
    const session = await requireAuthUser(request);
    const { albumId } = await context.params;
    await assertAlbumAccess(session.userId, albumId);

    const existing = await prisma.album.findUnique({
      where: { id: albumId },
      select: { id: true, bandId: true, title: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Album not found." }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.song.updateMany({
        where: { albumId },
        data: { albumId: null, albumTrackNo: null },
      });
      await tx.album.delete({ where: { id: albumId } });
    });

    await writeAuditLog({
      bandId: existing.bandId,
      actorUserId: session.userId,
      action: "album_deleted",
      entityType: "album",
      entityId: existing.id,
      payload: { title: existing.title },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete album." },
      { status: 400 },
    );
  }
}
