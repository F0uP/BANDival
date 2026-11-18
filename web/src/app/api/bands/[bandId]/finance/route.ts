import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuthUser, requireBandAction, writeAuditLog } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse, HttpError } from "@/lib/http";

type Context = { params: Promise<{ bandId: string }> };

const createSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amountCents: z.number().int().min(-100_000_000).max(100_000_000).refine((value) => value !== 0, "Betrag darf nicht 0 sein."),
  category: z.string().trim().min(1).max(60),
  description: z.string().trim().min(1, "Bitte eine Beschreibung angeben.").max(300),
  eventId: z.string().uuid().nullable().optional(),
});

/** Band cash book: transactions of a year, balance, categories, monthly totals, open fees. */
export async function GET(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const bandId = parseUuid((await context.params).bandId, "Band-ID");
    await requireBandAction(session.userId, bandId, "finance.view");
    const year = Number(request.nextUrl.searchParams.get("year")) || new Date().getFullYear();
    const from = new Date(`${year}-01-01T00:00:00Z`);
    const to = new Date(`${year + 1}-01-01T00:00:00Z`);

    const [transactions, recurring, total, openFees] = await Promise.all([
      prisma.financeTransaction.findMany({
        where: { bandId, date: { gte: from, lt: to } },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        select: { id: true, date: true, amountCents: true, category: true, description: true, recurringId: true, event: { select: { id: true, title: true } }, createdBy: { select: { displayName: true } } },
      }),
      prisma.recurringTransaction.findMany({ where: { bandId }, orderBy: { createdAt: "asc" } }),
      prisma.financeTransaction.aggregate({ where: { bandId }, _sum: { amountCents: true } }),
      prisma.event.findMany({
        where: { bandId, kind: "gig", feeCents: { gt: 0 }, feeStatus: { in: ["open", "invoiced"] }, status: { not: "cancelled" } },
        orderBy: { startsAt: "asc" },
        select: { id: true, title: true, startsAt: true, feeCents: true, feeStatus: true },
      }),
    ]);

    const months = Array.from({ length: 12 }, (_, month) => ({ month: month + 1, income: 0, expense: 0 }));
    const categories = new Map<string, number>();
    for (const entry of transactions) {
      const month = entry.date.getUTCMonth();
      if (entry.amountCents >= 0) months[month].income += entry.amountCents;
      else months[month].expense += -entry.amountCents;
      categories.set(entry.category, (categories.get(entry.category) ?? 0) + entry.amountCents);
    }
    const members = await prisma.bandMember.count({ where: { bandId, role: { not: "guest" } } });
    return NextResponse.json({
      year,
      balanceCents: total._sum.amountCents ?? 0,
      transactions: transactions.map((entry) => ({ ...entry, date: entry.date.toISOString().slice(0, 10) })),
      recurring,
      months,
      categories: Array.from(categories, ([category, amountCents]) => ({ category, amountCents })).sort((a, b) => a.amountCents - b.amountCents),
      openFees,
      members,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const bandId = parseUuid((await context.params).bandId, "Band-ID");
    await requireBandAction(session.userId, bandId, "finance.manage");
    const payload = createSchema.parse(await request.json());
    if (payload.eventId) {
      const event = await prisma.event.count({ where: { id: payload.eventId, bandId } });
      if (!event) throw new HttpError("Termin gehört nicht zur Band.", 400);
    }
    const transaction = await prisma.financeTransaction.create({
      data: { bandId, date: new Date(`${payload.date}T00:00:00Z`), amountCents: payload.amountCents, category: payload.category, description: payload.description, eventId: payload.eventId ?? null, createdByUserId: session.userId },
    });
    await writeAuditLog({ bandId, actorUserId: session.userId, action: "finance_booked", entityType: "finance", entityId: transaction.id, payload: { amountCents: payload.amountCents, description: payload.description } });
    return NextResponse.json({ id: transaction.id }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Buchung konnte nicht gespeichert werden.");
  }
}
