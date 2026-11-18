import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertAlbumAccess, requireAuthUser } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse, HttpError, json } from "@/lib/http";
import { deleteUpload, isImageFile, MAX_IMAGE_BYTES, saveUpload } from "@/lib/storage";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ albumId: string }> }) {
  try {
    const session = await requireAuthUser(request);
    const albumId = parseUuid((await context.params).albumId, "Album-ID");
    await assertAlbumAccess(session.userId, albumId);
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      throw new HttpError("Keine Datei hochgeladen.", 400);
    }
    if (!isImageFile(file)) {
      throw new HttpError("Bitte ein Bild (PNG, JPG, WebP) hochladen.", 400);
    }

    const previous = await prisma.album.findUnique({ where: { id: albumId }, select: { coverUrl: true } });
    const coverUrl = await saveUpload(file, "albums", albumId, { maxBytes: MAX_IMAGE_BYTES, fallbackExtension: ".png" });
    const album = await prisma.album.update({ where: { id: albumId }, data: { coverUrl }, select: { id: true, coverUrl: true } });
    await deleteUpload(previous?.coverUrl);

    return json({ album });
  } catch (error) {
    return errorResponse(error, "Cover-Upload fehlgeschlagen.");
  }
}
