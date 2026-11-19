import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseUuid } from "@/lib/api";
import { errorResponse, HttpError } from "@/lib/http";
import { computeTotals, itemSchema, missingMandatoryFields, recipientSchema } from "@/lib/invoice";
import { bandInvoiceSettings, invoiceParts, loadInvoiceForUser, presentInvoice, relabelGigItems, toDate } from "@/lib/invoices-server";

type Context = { params: Promise<{ invoiceId: string }> };
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const patchSchema = z.object({
  recipient: recipientSchema.optional(),
  items: z.array(itemSchema).max(100).optional(),
  serviceDate: dateString.nullable().optional(),
  serviceDateTo: dateString.nullable().optional(),
  dueDate: dateString.nullable().optional(),
  intro: z.string().max(2000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  reverseCharge: z.boolean().optional(),
  language: z.enum(["de", "en"]).optional(),
});

export async function GET(request: NextRequest, context: Context) {
  try {
    const { invoice } = await loadInvoiceForUser(request, parseUuid((await context.params).invoiceId, "Rechnungs-ID"), "finance.view");
    const settings = await bandInvoiceSettings(invoice.bandId);
    const { recipient, items } = invoiceParts(invoice);
    const smallBusiness = invoice.status === "draft" ? settings.smallBusiness : invoice.smallBusiness;
    const missing = missingMandatoryFields({ issuer: settings, recipient, items, serviceDate: invoice.serviceDate, smallBusiness, reverseCharge: invoice.reverseCharge, notes: invoice.notes });
    const totals = computeTotals(items, smallBusiness, invoice.reverseCharge);
    const event = invoice.eventId ? await prisma.event.findUnique({ where: { id: invoice.eventId }, select: { id: true, title: true } }) : null;
    return NextResponse.json({ invoice: { ...presentInvoice(invoice), event }, missing, totals, smallBusiness, paymentTermDays: settings.paymentTermDays });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Only drafts can be edited – issued invoices are immutable (cancel + new invoice instead). */
export async function PATCH(request: NextRequest, context: Context) {
  try {
    const { invoice } = await loadInvoiceForUser(request, parseUuid((await context.params).invoiceId, "Rechnungs-ID"), "finance.manage");
    if (invoice.status !== "draft") throw new HttpError("Gestellte Rechnungen können nicht mehr geändert werden – storniere sie und erstelle eine neue.", 409);
    const payload = patchSchema.parse(await request.json());
    const updated = await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        recipient: payload.recipient as unknown as Prisma.InputJsonValue | undefined,
        items: payload.items as unknown as Prisma.InputJsonValue | undefined,
        serviceDate: toDate(payload.serviceDate),
        serviceDateTo: toDate(payload.serviceDateTo),
        dueDate: toDate(payload.dueDate),
        intro: payload.intro === undefined ? undefined : payload.intro?.trim() || null,
        notes: payload.notes === undefined ? undefined : payload.notes?.trim() || null,
        reverseCharge: payload.reverseCharge,
        language: payload.language,
        // The gig line prefilled from the calendar follows the document language.
        ...(payload.language && payload.language !== invoice.language && !payload.items && invoice.eventId
          ? { items: (await relabelGigItems(invoice.eventId, invoiceParts(invoice).items, payload.language)) as unknown as Prisma.InputJsonValue }
          : {}),
      },
    });
    return NextResponse.json({ invoice: presentInvoice(updated) });
  } catch (error) {
    return errorResponse(error, "Rechnung konnte nicht gespeichert werden.");
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    const { invoice } = await loadInvoiceForUser(request, parseUuid((await context.params).invoiceId, "Rechnungs-ID"), "finance.manage");
    if (invoice.status !== "draft") throw new HttpError("Gestellte Rechnungen dürfen nicht gelöscht werden (Aufbewahrungspflicht) – nutze „Stornieren“.", 409);
    await prisma.invoice.delete({ where: { id: invoice.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
