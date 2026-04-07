import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertAlbumAccess, requireAuthUser } from "@/lib/auth";

const schema = z.object({
  orderedSongIds: z.array(z.string().uuid()).min(1),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ albumId: string }> },
) {
  try {
    const session = await requireAuthUser(request);
    const { albumId } = await context.params;
    await assertAlbumAccess(session.userId, albumId);
    const payload = schema.parse(await request.json());

    await prisma.$transaction(
      payload.orderedSongIds.map((songId, index) =>
        prisma.song.update({
          where: { id: songId },
          data: {
            albumId,
            albumTrackNo: index + 1,
          },
        }),
      ),
    );

    const album = await prisma.album.findUnique({
      where: { id: albumId },
      include: {
        songs: {
          orderBy: [{ albumTrackNo: "asc" }, { title: "asc" }],
        },
      },
    });

    return NextResponse.json({ album });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Track order update failed." },
      { status: 400 },
    );
  }
}
