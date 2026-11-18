import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuthUser, requireBandAction } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse, HttpError } from "@/lib/http";
import { parseInvoiceSettings } from "@/lib/invoice";
import { deleteUpload, MAX_IMAGE_BYTES, resolveUploadPath, saveUpload, streamFile } from "@/lib/storage";

export const runtime = "nodejs";

type Context = { params: Promise<{ bandId: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const bandId = parseUuid((await context.params).bandId, "Band-ID");
    await requireBandAction(session.userId, bandId, "finance.view");
    const band = await prisma.band.findUniqueOrThrow({ where: { id: bandId }, select: { name: true, invoiceSettings: true } });
    const file = resolveUploadPath(parseInvoiceSettings(band.invoiceSettings, band.name).logoUrl ?? "");
    if (!file) throw new HttpError("Kein Logo hinterlegt.", 404);
    return await streamFile(file, request, { "Cache-Control": "private, max-age=300" });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Logo for invoices – PNG or JPG (embedded into the PDF). */
export async function POST(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const bandId = parseUuid((await context.params).bandId, "Band-ID");
    await requireBandAction(session.userId, bandId, "finance.manage");
    const file = (await request.formData()).get("file");
    if (!(file instanceof File) || !/^image\/(png|jpeg)$/.test(file.type)) throw new HttpError("Bitte ein Logo als PNG oder JPG hochladen.", 400);
    const band = await prisma.band.findUniqueOrThrow({ where: { id: bandId }, select: { name: true, invoiceSettings: true } });
    const settings = parseInvoiceSettings(band.invoiceSettings, band.name);
    const logoUrl = await saveUpload(file, "bands", bandId, { maxBytes: MAX_IMAGE_BYTES, fallbackExtension: file.type === "image/png" ? ".png" : ".jpg" });
    await prisma.band.update({ where: { id: bandId }, data: { invoiceSettings: { ...settings, logoUrl } as unknown as Prisma.InputJsonValue } });
    await deleteUpload(settings.logoUrl);
    return NextResponse.json({ logoUrl });
  } catch (error) {
    return errorResponse(error, "Logo konnte nicht hochgeladen werden.");
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const bandId = parseUuid((await context.params).bandId, "Band-ID");
    await requireBandAction(session.userId, bandId, "finance.manage");
    const band = await prisma.band.findUniqueOrThrow({ where: { id: bandId }, select: { name: true, invoiceSettings: true } });
    const settings = parseInvoiceSettings(band.invoiceSettings, band.name);
    await prisma.band.update({ where: { id: bandId }, data: { invoiceSettings: { ...settings, logoUrl: null } as unknown as Prisma.InputJsonValue } });
    await deleteUpload(settings.logoUrl);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
