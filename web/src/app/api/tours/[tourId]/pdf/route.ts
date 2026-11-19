import { NextRequest, NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse } from "@/lib/http";
import { loadTourForUser, renderTourPdf, tourDetail } from "@/lib/tours";
import { getLocale, getT } from "@/lib/i18n/server";
import { intlLocaleOf } from "@/lib/i18n/core";

export const runtime = "nodejs";

/** Tour itinerary (day sheets) as PDF – in the language of the person downloading it. */
export async function GET(request: NextRequest, context: { params: Promise<{ tourId: string }> }) {
  try {
    const session = await requireAuthUser(request);
    const { tour } = await loadTourForUser(parseUuid((await context.params).tourId, "Tour-ID"), session.userId);
    const [detail, t, locale] = await Promise.all([tourDetail(tour.id), getT(), getLocale()]);
    const bytes = await renderTourPdf(detail, t as (text: string, values?: Record<string, string | number>) => string, intlLocaleOf(locale));
    const name = `${tour.name}-tourplan`.normalize("NFKD").replace(/[^\w-]+/g, "-").slice(0, 80);
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${request.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline"}; filename="${name}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return errorResponse(error, "Tourplan konnte nicht erstellt werden.");
  }
}
