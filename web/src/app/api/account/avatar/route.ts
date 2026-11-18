import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthUser } from "@/lib/auth";
import { errorResponse, HttpError } from "@/lib/http";
import { deleteUpload, isImageFile, MAX_IMAGE_BYTES, saveUpload } from "@/lib/storage";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      throw new HttpError("Keine Datei hochgeladen.", 400);
    }
    if (!isImageFile(file)) {
      throw new HttpError("Bitte ein Bild (PNG, JPG, WebP, GIF) hochladen.", 400);
    }

    const previous = await prisma.appUser.findUnique({ where: { id: session.userId }, select: { avatarUrl: true } });
    const avatarUrl = await saveUpload(file, "avatars", session.userId, { maxBytes: MAX_IMAGE_BYTES, fallbackExtension: ".png" });
    const user = await prisma.appUser.update({
      where: { id: session.userId },
      data: { avatarUrl },
      select: { id: true, email: true, displayName: true, avatarUrl: true },
    });

    if (previous?.avatarUrl?.startsWith(`/uploads/avatars/${session.userId}/`)) {
      await deleteUpload(previous.avatarUrl);
    }

    return NextResponse.json({ user, avatarUrl });
  } catch (error) {
    return errorResponse(error, "Avatar-Upload fehlgeschlagen.");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const previous = await prisma.appUser.findUnique({ where: { id: session.userId }, select: { avatarUrl: true } });
    await prisma.appUser.update({ where: { id: session.userId }, data: { avatarUrl: null } });
    if (previous?.avatarUrl?.startsWith(`/uploads/avatars/${session.userId}/`)) {
      await deleteUpload(previous.avatarUrl);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
