import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AuthError, requireAuthUser, requireBandAction } from "@/lib/auth";
import { dateKeyInZone } from "@/lib/dates";
import { HttpError } from "@/lib/http";
import {
  computeTotals, formatInvoiceNumber, itemSchema, missingMandatoryFields, parseInvoiceSettings, recipientSchema,
  type InvoiceItem, type InvoiceRecipient, type InvoiceSettings,
} from "@/lib/invoice";
import type { NextRequest } from "next/server";

export async function loadInvoiceForUser(request: NextRequest, invoiceId: string, action: "finance.view" | "finance.manage") {
  const session = await requireAuthUser(request);
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw new AuthError("Rechnung nicht gefunden.", 404);
  try {
    await requireBandAction(session.userId, invoice.bandId, action);
  } catch {
    throw new AuthError("Rechnung nicht gefunden.", 404);
  }
  return { session, invoice };
}

export function invoiceParts(invoice: { recipient: Prisma.JsonValue; items: Prisma.JsonValue }) {
  const recipient = recipientSchema.parse(invoice.recipient ?? {});
  const items = Array.isArray(invoice.items) ? invoice.items.map((item) => itemSchema.parse(item)) : [];
  return { recipient, items };
}

export async function bandInvoiceSettings(bandId: string): Promise<InvoiceSettings & { bandName: string; timezone: string }> {
  const band = await prisma.band.findUniqueOrThrow({ where: { id: bandId }, select: { name: true, timezone: true, invoiceSettings: true } });
  return { ...parseInvoiceSettings(band.invoiceSettings, band.name), bandName: band.name, timezone: band.timezone };
}

export function toDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

export function dateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

export function presentInvoice<T extends { recipient: Prisma.JsonValue; items: Prisma.JsonValue; issueDate: Date | null; serviceDate: Date | null; serviceDateTo: Date | null; dueDate: Date | null }>(invoice: T) {
  return {
    ...invoice,
    issueDate: dateOnly(invoice.issueDate),
    serviceDate: dateOnly(invoice.serviceDate),
    serviceDateTo: dateOnly(invoice.serviceDateTo),
    dueDate: dateOnly(invoice.dueDate),
  };
}

/**
 * Issues an invoice: validates the mandatory fields (§ 14 Abs. 4 UStG), assigns the next gap-free number of the
 * year, freezes the issuer data and totals. Retries when two invoices are issued at the same moment.
 */
export async function issueInvoice(args: {
  bandId: string;
  invoiceId: string;
  recipient: InvoiceRecipient;
  items: InvoiceItem[];
  serviceDate: Date | null;
  dueDate: Date | null;
  reverseCharge: boolean;
  notes?: string | null;
  settings: InvoiceSettings & { timezone: string };
}) {
  const smallBusiness = args.settings.smallBusiness;
  const missing = missingMandatoryFields({
    issuer: args.settings, recipient: args.recipient, items: args.items, serviceDate: args.serviceDate, smallBusiness, reverseCharge: args.reverseCharge, notes: args.notes,
  });
  if (missing.length) throw new HttpError(`Für eine gültige Rechnung fehlt noch: ${missing.join(", ")}.`, 400);
  const totals = computeTotals(args.items, smallBusiness, args.reverseCharge);
  const todayKey = dateKeyInZone(new Date(), args.settings.timezone);
  const issueDate = new Date(`${todayKey}T00:00:00.000Z`);
  const year = issueDate.getUTCFullYear();
  const month = issueDate.getUTCMonth() + 1;
  const dueDate = args.dueDate ?? new Date(issueDate.getTime() + args.settings.paymentTermDays * 86_400_000);
  const { timezone: _timezone, ...issuer } = args.settings;
  void _timezone;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const last = await tx.invoice.aggregate({ where: { bandId: args.bandId, year, sequence: { not: null } }, _max: { sequence: true } });
        const sequence = (last._max.sequence ?? 0) + 1;
        const number = formatInvoiceNumber(args.settings.numberFormat, year, month, sequence);
        const updated = await tx.invoice.updateMany({
          where: { id: args.invoiceId, status: "draft" },
          data: {
            status: "issued", number, year, sequence, issueDate, dueDate,
            netCents: totals.netCents, vatCents: totals.vatCents, grossCents: totals.grossCents,
            smallBusiness, reverseCharge: args.reverseCharge,
            issuer: issuer as unknown as Prisma.InputJsonValue,
          },
        });
        if (updated.count !== 1) throw new HttpError("Diese Rechnung wurde bereits gestellt.", 409);
        return tx.invoice.findUniqueOrThrow({ where: { id: args.invoiceId } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      const retry = (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2002" || error.code === "P2034"));
      if (!retry || attempt === 3) throw error;
    }
  }
  throw new HttpError("Rechnungsnummer konnte nicht vergeben werden.", 500);
}
