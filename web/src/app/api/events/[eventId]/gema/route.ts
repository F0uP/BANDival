import { NextRequest, NextResponse } from "next/server";
import { assertEventAccess, requireAuthUser } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse } from "@/lib/http";
import { gemaCsv, loadGemaList, renderGemaPdf } from "@/lib/gema";

export const runtime = "nodejs";

/** GEMA set list of a gig: ?format=json (overview with missing data) | csv | pdf */
export async function GET(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  try {
    const session = await requireAuthUser(request);
    const eventId = parseUuid((await context.params).eventId, "Termin-ID");
    await assertEventAccess(session.userId, eventId);
    const list = await loadGemaList(eventId);
    const format = request.nextUrl.searchParams.get("format") ?? "json";
    const base = `Musikfolge-${list.bandName}-${list.event.date}`.normalize("NFKD").replace(/[^\w.-]+/g, "-").slice(0, 80);
    if (format === "csv") {
      return new NextResponse(gemaCsv(list), {
        headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.csv"`, "Cache-Control": "private, no-store" },
      });
    }
    if (format === "pdf") {
      const bytes = await renderGemaPdf(list);
      return new NextResponse(Buffer.from(bytes), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `${request.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline"}; filename="${base}.pdf"`,
          "Cache-Control": "private, no-store",
        },
      });
    }
    return NextResponse.json({ gema: list });
  } catch (error) {
    return errorResponse(error, "Musikfolge konnte nicht erstellt werden.");
  }
}
