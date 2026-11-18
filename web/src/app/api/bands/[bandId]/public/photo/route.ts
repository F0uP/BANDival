import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthUser, requireBandAction } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse, HttpError } from "@/lib/http";
import { deleteUpload, isImageFile, MAX_IMAGE_BYTES, saveUpload } from "@/lib/storage";

export const runtime = "nodejs";

type Context = { params: Promise<{ bandId: string }> };

/** Press photo for the public band page. */
export async function POST(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const bandId = parseUuid((await context.params).bandId, "Band-ID");
    await requireBandAction(session.userId, bandId, "public.manage");
    const file = (await request.formData()).get("file");
    if (!(file instanceof File) || !isImageFile(file)) throw new HttpError("Bitte ein Bild (JPG, PNG, WebP) hochladen.", 400);
    const previous = await prisma.band.findUnique({ where: { id: bandId }, select: { pressPhotoUrl: true } });
    const pressPhotoUrl = await saveUpload(file, "bands", bandId, { maxBytes: MAX_IMAGE_BYTES, fallbackExtension: ".jpg" });
    await prisma.band.update({ where: { id: bandId }, data: { pressPhotoUrl } });
    await deleteUpload(previous?.pressPhotoUrl);
    return NextResponse.json({ pressPhotoUrl });
  } catch (error) {
    return errorResponse(error, "Foto konnte nicht hochgeladen werden.");
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const bandId = parseUuid((await context.params).bandId, "Band-ID");
    await requireBandAction(session.userId, bandId, "public.manage");
    const previous = await prisma.band.findUnique({ where: { id: bandId }, select: { pressPhotoUrl: true } });
    await prisma.band.update({ where: { id: bandId }, data: { pressPhotoUrl: null } });
    await deleteUpload(previous?.pressPhotoUrl);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
