import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AuthError, assertAlbumAccess, requireAuthUser, writeAuditLog } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse, json } from "@/lib/http";
import { albumSongSelect } from "@/lib/schemas";
import { deleteUploadDirectory } from "@/lib/storage";

const patchSchema = z.object({
  title: z.string().trim().min(1, "Der Titel darf nicht leer sein.").max(200).optional(),
  releaseDate: z.string().date().nullable().optional(),
});

type Context = { params: Promise<{ albumId: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const albumId = parseUuid((await context.params).albumId, "Album-ID");
    await assertAlbumAccess(session.userId, albumId);

    const album = await prisma.album.findUnique({
      where: { id: albumId },
      include: { songs: { orderBy: [{ albumTrackNo: "asc" }, { title: "asc" }], select: albumSongSelect } },
    });
    if (!album) {
      throw new AuthError("Album nicht gefunden.", 404);
    }
    return json({ album });
  } catch (error) {
    return errorResponse(error, "Album konnte nicht geladen werden.");
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const albumId = parseUuid((await context.params).albumId, "Album-ID");
    const { bandId } = await assertAlbumAccess(session.userId, albumId);
    const payload = patchSchema.parse(await request.json());

    const album = await prisma.album.update({
      where: { id: albumId },
      data: {
        title: payload.title,
        releaseDate: payload.releaseDate === undefined ? undefined : payload.releaseDate ? new Date(payload.releaseDate) : null,
      },
      include: { songs: { orderBy: [{ albumTrackNo: "asc" }, { title: "asc" }], select: albumSongSelect } },
    });

    await writeAuditLog({
      bandId,
      actorUserId: session.userId,
      action: "album_updated",
      entityType: "album",
      entityId: albumId,
      payload: { title: album.title },
    });

    return json({ album });
  } catch (error) {
    return errorResponse(error, "Album konnte nicht gespeichert werden.");
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const albumId = parseUuid((await context.params).albumId, "Album-ID");
    const { bandId } = await assertAlbumAccess(session.userId, albumId);

    const existing = await prisma.album.findUnique({ where: { id: albumId }, select: { id: true, title: true } });
    if (!existing) {
      throw new AuthError("Album nicht gefunden.", 404);
    }

    await prisma.$transaction([
      prisma.song.updateMany({ where: { albumId }, data: { albumId: null, albumTrackNo: null } }),
      prisma.album.delete({ where: { id: albumId } }),
    ]);
    await deleteUploadDirectory("albums", albumId);

    await writeAuditLog({
      bandId,
      actorUserId: session.userId,
      action: "album_deleted",
      entityType: "album",
      entityId: existing.id,
      payload: { title: existing.title },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Album konnte nicht gelöscht werden.");
  }
}
