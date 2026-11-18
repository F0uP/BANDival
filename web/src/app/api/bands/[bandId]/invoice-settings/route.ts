import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuthUser, requireBandAction, writeAuditLog } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse } from "@/lib/http";
import { invoiceSettingsSchema, parseInvoiceSettings } from "@/lib/invoice";

type Context = { params: Promise<{ bandId: string }> };

const putSchema = invoiceSettingsSchema.omit({ logoUrl: true }).refine((value) => /\{N+\}/.test(value.numberFormat), {
  message: "Das Nummernformat braucht eine fortlaufende Nummer, z. B. {NNN}.",
  path: ["numberFormat"],
});

export async function GET(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const bandId = parseUuid((await context.params).bandId, "Band-ID");
    await requireBandAction(session.userId, bandId, "finance.view");
    const band = await prisma.band.findUniqueOrThrow({ where: { id: bandId }, select: { name: true, invoiceSettings: true } });
    return NextResponse.json({ settings: parseInvoiceSettings(band.invoiceSettings, band.name) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const bandId = parseUuid((await context.params).bandId, "Band-ID");
    await requireBandAction(session.userId, bandId, "finance.manage");
    const payload = putSchema.parse(await request.json());
    const band = await prisma.band.findUniqueOrThrow({ where: { id: bandId }, select: { name: true, invoiceSettings: true } });
    const current = parseInvoiceSettings(band.invoiceSettings, band.name);
    const settings = { ...current, ...payload, iban: payload.iban.replace(/\s+/g, " ").toUpperCase(), bic: payload.bic.toUpperCase() };
    await prisma.band.update({ where: { id: bandId }, data: { invoiceSettings: settings as unknown as Prisma.InputJsonValue } });
    await writeAuditLog({ bandId, actorUserId: session.userId, action: "band_updated", entityType: "band", entityId: bandId, payload: { invoiceSettings: true } });
    return NextResponse.json({ settings });
  } catch (error) {
    return errorResponse(error, "Rechnungsdaten konnten nicht gespeichert werden.");
  }
}
