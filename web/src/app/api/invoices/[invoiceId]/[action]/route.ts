import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse, HttpError } from "@/lib/http";
import { computeTotals } from "@/lib/invoice";
import { bandInvoiceSettings, invoiceParts, issueInvoice, loadInvoiceForUser, presentInvoice } from "@/lib/invoices-server";

type Context = { params: Promise<{ invoiceId: string; action: string }> };

/** Invoice workflow: issue · pay · cancel (Stornorechnung) · duplicate. */
export async function POST(request: NextRequest, context: Context) {
  try {
    const params = await context.params;
    const { session, invoice } = await loadInvoiceForUser(request, parseUuid(params.invoiceId, "Rechnungs-ID"), "finance.manage");
    const { recipient, items } = invoiceParts(invoice);

    if (params.action === "issue") {
      if (invoice.status !== "draft") throw new HttpError("Diese Rechnung wurde bereits gestellt.", 409);
      const settings = await bandInvoiceSettings(invoice.bandId);
      const issued = await issueInvoice({
        bandId: invoice.bandId, invoiceId: invoice.id, recipient, items, serviceDate: invoice.serviceDate, dueDate: invoice.dueDate,
        reverseCharge: invoice.reverseCharge, notes: invoice.notes, settings,
      });
      if (invoice.eventId) {
        await prisma.event.updateMany({ where: { id: invoice.eventId, OR: [{ feeStatus: null }, { feeStatus: { in: ["open", "none"] } }] }, data: { feeStatus: "invoiced", feeCents: issued.grossCents } });
      }
      await writeAuditLog({ bandId: invoice.bandId, actorUserId: session.userId, action: "invoice_issued", entityType: "invoice", entityId: invoice.id, payload: { number: issued.number, grossCents: issued.grossCents } });
      return NextResponse.json({ invoice: presentInvoice(issued) });
    }

    if (params.action === "pay") {
      if (invoice.status !== "issued" || invoice.cancelsNumber) throw new HttpError("Nur gestellte, offene Rechnungen können als bezahlt markiert werden.", 409);
      const paid = await prisma.$transaction(async (tx) => {
        const updated = await tx.invoice.update({ where: { id: invoice.id }, data: { status: "paid", paidAt: new Date() } });
        // Book the income once – a gig fee that was already booked (fee status "paid") is not booked again.
        const alreadyBooked = invoice.eventId ? await tx.financeTransaction.count({ where: { eventId: invoice.eventId, category: "Gage" } }) : 0;
        if (!alreadyBooked && invoice.grossCents !== 0) {
          await tx.financeTransaction.create({
            data: {
              bandId: invoice.bandId, date: new Date(new Date().toISOString().slice(0, 10)), amountCents: invoice.grossCents,
              category: invoice.eventId ? "Gage" : "Rechnung", description: `Rechnung ${invoice.number}`, eventId: invoice.eventId, createdByUserId: session.userId,
            },
          });
        }
        if (invoice.eventId) await tx.event.update({ where: { id: invoice.eventId }, data: { feeStatus: "paid" } });
        return updated;
      });
      await writeAuditLog({ bandId: invoice.bandId, actorUserId: session.userId, action: "invoice_paid", entityType: "invoice", entityId: invoice.id, payload: { number: invoice.number } });
      return NextResponse.json({ invoice: presentInvoice(paid) });
    }

    if (params.action === "cancel") {
      if (invoice.status !== "issued" && invoice.status !== "paid") throw new HttpError("Nur gestellte Rechnungen können storniert werden.", 409);
      if (invoice.cancelsNumber) throw new HttpError("Eine Stornorechnung kann nicht storniert werden.", 409);
      const settings = await bandInvoiceSettings(invoice.bandId);
      const draft = await prisma.invoice.create({
        data: {
          bandId: invoice.bandId, eventId: invoice.eventId, recipient: invoice.recipient as Prisma.InputJsonValue,
          items: items.map((item) => ({ ...item, unitPriceCents: -item.unitPriceCents })) as unknown as Prisma.InputJsonValue,
          serviceDate: invoice.serviceDate, serviceDateTo: invoice.serviceDateTo, cancelsNumber: invoice.number,
          reverseCharge: invoice.reverseCharge, smallBusiness: invoice.smallBusiness, language: invoice.language, createdByUserId: session.userId,
        },
      });
      // The cancellation invoice uses the issuer data frozen on the original invoice.
      const frozen = { ...settings, ...(invoice.issuer as object | null ?? {}) };
      const cancellation = await issueInvoice({
        bandId: invoice.bandId, invoiceId: draft.id, recipient, items: items.map((item) => ({ ...item, unitPriceCents: -item.unitPriceCents })),
        serviceDate: invoice.serviceDate, dueDate: null, reverseCharge: invoice.reverseCharge, notes: invoice.notes ?? "Storno", settings: { ...frozen, smallBusiness: invoice.smallBusiness },
      });
      await prisma.invoice.update({ where: { id: invoice.id }, data: { status: "cancelled", cancelledAt: new Date() } });
      if (invoice.status === "paid") {
        await prisma.financeTransaction.create({
          data: { bandId: invoice.bandId, date: new Date(new Date().toISOString().slice(0, 10)), amountCents: -invoice.grossCents, category: invoice.eventId ? "Gage" : "Rechnung", description: `Storno ${cancellation.number} zu ${invoice.number}`, createdByUserId: session.userId },
        });
      }
      if (invoice.eventId) await prisma.event.updateMany({ where: { id: invoice.eventId, feeStatus: "invoiced" }, data: { feeStatus: "open" } });
      await writeAuditLog({ bandId: invoice.bandId, actorUserId: session.userId, action: "invoice_cancelled", entityType: "invoice", entityId: invoice.id, payload: { number: invoice.number, cancellation: cancellation.number } });
      return NextResponse.json({ invoice: presentInvoice(cancellation) });
    }

    if (params.action === "duplicate") {
      const copy = await prisma.invoice.create({
        data: {
          bandId: invoice.bandId, eventId: invoice.eventId, recipient: invoice.recipient as Prisma.InputJsonValue,
          items: (invoice.cancelsNumber ? items.map((item) => ({ ...item, unitPriceCents: Math.abs(item.unitPriceCents) })) : items) as unknown as Prisma.InputJsonValue,
          serviceDate: invoice.serviceDate, serviceDateTo: invoice.serviceDateTo, intro: invoice.intro, notes: invoice.notes,
          reverseCharge: invoice.reverseCharge, smallBusiness: invoice.smallBusiness, language: invoice.language, createdByUserId: session.userId,
        },
      });
      const totals = computeTotals(items, invoice.smallBusiness, invoice.reverseCharge);
      return NextResponse.json({ invoice: presentInvoice(copy), totals }, { status: 201 });
    }

    throw new HttpError("Unbekannte Aktion.", 404);
  } catch (error) {
    return errorResponse(error, "Aktion fehlgeschlagen.");
  }
}
