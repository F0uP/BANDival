import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertAlbumAccess, assertSongsInBand, requireAuthUser } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse, json } from "@/lib/http";
import { albumSongSelect } from "@/lib/schemas";

const schema = z.object({
  orderedSongIds: z.array(z.string().uuid()).max(200),
});

/** Sets the complete tracklist: listed songs get numbered, songs no longer listed are removed from the album. */
export async function PATCH(request: NextRequest, context: { params: Promise<{ albumId: string }> }) {
  try {
    const session = await requireAuthUser(request);
    const albumId = parseUuid((await context.params).albumId, "Album-ID");
    const { bandId } = await assertAlbumAccess(session.userId, albumId);
    const payload = schema.parse(await request.json());
    const orderedSongIds = Array.from(new Set(payload.orderedSongIds));
    await assertSongsInBand(bandId, orderedSongIds);

    await prisma.$transaction([
      prisma.song.updateMany({
        where: { albumId, id: { notIn: orderedSongIds } },
        data: { albumId: null, albumTrackNo: null },
      }),
      ...orderedSongIds.map((songId, index) =>
        prisma.song.update({ where: { id: songId }, data: { albumId, albumTrackNo: index + 1 } }),
      ),
    ]);

    const album = await prisma.album.findUnique({
      where: { id: albumId },
      include: { songs: { orderBy: [{ albumTrackNo: "asc" }, { title: "asc" }], select: albumSongSelect } },
    });

    return json({ album });
  } catch (error) {
    return errorResponse(error, "Tracklist konnte nicht gespeichert werden.");
  }
}
