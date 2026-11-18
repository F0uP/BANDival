import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuthUser, requireBandAction, writeAuditLog } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse, HttpError } from "@/lib/http";
import { itemSchema, recipientSchema } from "@/lib/invoice";
import { bandInvoiceSettings, presentInvoice, toDate } from "@/lib/invoices-server";

type Context = { params: Promise<{ bandId: string }> };

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const createSchema = z.object({
  eventId: z.string().uuid().nullable().optional(),
  recipient: recipientSchema.optional(),
  items: z.array(itemSchema).max(100).optional(),
  serviceDate: dateString.nullable().optional(),
  serviceDateTo: dateString.nullable().optional(),
  intro: z.string().max(2000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  reverseCharge: z.boolean().optional(),
});

export async function GET(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const bandId = parseUuid((await context.params).bandId, "Band-ID");
    await requireBandAction(session.userId, bandId, "finance.view");
    const invoices = await prisma.invoice.findMany({
      where: { bandId },
      orderBy: [{ createdAt: "desc" }],
      take: 300,
      include: { event: { select: { id: true, title: true, startsAt: true } } },
    });
    return NextResponse.json({ invoices: invoices.map(presentInvoice) });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Creates a draft – for a gig the organiser, service date and fee are filled in automatically. */
export async function POST(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const bandId = parseUuid((await context.params).bandId, "Band-ID");
    await requireBandAction(session.userId, bandId, "finance.manage");
    const payload = createSchema.parse(await request.json());
    const settings = await bandInvoiceSettings(bandId);
    const vatRate = settings.smallBusiness ? 0 : settings.defaultVatRate;

    let recipient = payload.recipient ?? recipientSchema.parse({});
    let items = payload.items ?? [];
    let serviceDate = payload.serviceDate ?? null;
    if (payload.eventId) {
      const event = await prisma.event.findFirst({ where: { id: payload.eventId, bandId } });
      if (!event) throw new HttpError("Termin gehört nicht zur Band.", 400);
      if (!payload.recipient) recipient = { ...recipient, name: event.contactName ?? "", email: event.contactEmail ?? "" };
      if (!payload.items) {
        const date = event.startsAt.toLocaleDateString("de-DE", { timeZone: settings.timezone, day: "2-digit", month: "2-digit", year: "numeric" });
        items = [{
          description: `Live-Auftritt „${event.title}“ am ${date}${event.venueLabel ? ` (${event.venueLabel})` : ""}`,
          quantity: 1, unit: "Pauschal", unitPriceCents: event.feeCents ?? 0, vatRate,
        }];
      }
      serviceDate ??= event.startsAt.toISOString().slice(0, 10);
    }
    const invoice = await prisma.invoice.create({
      data: {
        bandId,
        eventId: payload.eventId ?? null,
        recipient: recipient as unknown as Prisma.InputJsonValue,
        items: items as unknown as Prisma.InputJsonValue,
        serviceDate: toDate(serviceDate) ?? null,
        serviceDateTo: toDate(payload.serviceDateTo) ?? null,
        intro: payload.intro ?? null,
        notes: payload.notes ?? null,
        reverseCharge: payload.reverseCharge ?? false,
        smallBusiness: settings.smallBusiness,
        createdByUserId: session.userId,
      },
    });
    await writeAuditLog({ bandId, actorUserId: session.userId, action: "invoice_created", entityType: "invoice", entityId: invoice.id });
    return NextResponse.json({ invoice: presentInvoice(invoice) }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Rechnung konnte nicht angelegt werden.");
  }
}
