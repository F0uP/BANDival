import { NextRequest, NextResponse } from "next/server";
import { errorResponse, HttpError } from "@/lib/http";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/auth";
import { loadSharedRider, renderSharedRiderPdf } from "@/lib/rider-share";

export const runtime = "nodejs";

/** Rider PDF behind a public tech link – no account needed. */
export async function GET(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    await consumeRateLimit(`rider-pdf:${getClientIp(request) ?? "unknown"}`, 60, 60 * 60 * 1000);
    const shared = await loadSharedRider((await context.params).token);
    if (!shared) throw new HttpError("Dieser Link ist nicht mehr gültig.", 404);
    const bytes = await renderSharedRiderPdf(shared);
    const name = `${shared.bandName}-rider`.normalize("NFKD").replace(/[^\w-]+/g, "-").slice(0, 60);
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${request.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline"}; filename="${name}.pdf"`,
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
