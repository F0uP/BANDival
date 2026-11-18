import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthUser, requireBandAction } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse } from "@/lib/http";

function csv(value: string): string {
  // Neutralise spreadsheet formulas and quote everything.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** CSV export of the cash book (Excel-friendly: semicolon separated, UTF-8 BOM, comma decimals). */
export async function GET(request: NextRequest, context: { params: Promise<{ bandId: string }> }) {
  try {
    const session = await requireAuthUser(request);
    const bandId = parseUuid((await context.params).bandId, "Band-ID");
    await requireBandAction(session.userId, bandId, "finance.view");
    const year = Number(request.nextUrl.searchParams.get("year")) || null;
    const transactions = await prisma.financeTransaction.findMany({
      where: { bandId, ...(year ? { date: { gte: new Date(`${year}-01-01T00:00:00Z`), lt: new Date(`${year + 1}-01-01T00:00:00Z`) } } : {}) },
      orderBy: { date: "asc" },
      select: { date: true, amountCents: true, category: true, description: true, event: { select: { title: true } } },
    });
    const lines = ["Datum;Betrag;Kategorie;Beschreibung;Termin"];
    for (const entry of transactions) {
      lines.push([
        entry.date.toISOString().slice(0, 10),
        (entry.amountCents / 100).toFixed(2).replace(".", ","),
        csv(entry.category),
        csv(entry.description),
        csv(entry.event?.title ?? ""),
      ].join(";"));
    }
    return new NextResponse(`\uFEFF${lines.join("\r\n")}\r\n`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="bandkasse${year ? `-${year}` : ""}.csv"`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
