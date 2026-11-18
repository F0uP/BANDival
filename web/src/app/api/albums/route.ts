import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseBandId } from "@/lib/api";
import { requireAuthUser, requireBandAction, requireBandMembership, writeAuditLog } from "@/lib/auth";
import { errorResponse, json } from "@/lib/http";
import { albumSongSelect } from "@/lib/schemas";

const createAlbumSchema = z.object({
  bandId: z.string().uuid(),
  title: z.string().trim().min(1, "Bitte einen Albumtitel angeben.").max(200),
  releaseDate: z.string().date().nullable().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const bandId = parseBandId(request.nextUrl.searchParams.get("bandId"));
    await requireBandMembership(session.userId, bandId);

    const albums = await prisma.album.findMany({
      where: { bandId },
      include: { songs: { orderBy: [{ albumTrackNo: "asc" }, { title: "asc" }], select: albumSongSelect } },
      orderBy: [{ releaseDate: "desc" }, { updatedAt: "desc" }],
    });

    return json({ albums });
  } catch (error) {
    return errorResponse(error, "Alben konnten nicht geladen werden.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const payload = createAlbumSchema.parse(await request.json());
    await requireBandAction(session.userId, payload.bandId, "songs.create");

    const album = await prisma.album.create({
      data: {
        bandId: payload.bandId,
        title: payload.title,
        releaseDate: payload.releaseDate ? new Date(payload.releaseDate) : null,
      },
      include: { songs: { select: albumSongSelect } },
    });

    await writeAuditLog({
      bandId: payload.bandId,
      actorUserId: session.userId,
      action: "album_created",
      entityType: "album",
      entityId: album.id,
      payload: { title: album.title },
    });

    return json({ album }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Album konnte nicht erstellt werden.");
  }
}
