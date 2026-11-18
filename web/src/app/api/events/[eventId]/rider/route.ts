import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthError, assertEventAccess, requireAuthUser } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse } from "@/lib/http";
import { parseRider, renderRiderPdf } from "@/lib/rider";

export const runtime = "nodejs";

/** Technical rider + stage plot as PDF for this gig (times and venue included). */
export async function GET(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  try {
    const session = await requireAuthUser(request);
    const eventId = parseUuid((await context.params).eventId, "Termin-ID");
    const { bandId } = await assertEventAccess(session.userId, eventId);
    const [event, band] = await Promise.all([
      prisma.event.findUnique({ where: { id: eventId } }),
      prisma.band.findUnique({ where: { id: bandId }, select: { name: true, rider: true, timezone: true, contactEmail: true } }),
    ]);
    if (!event || !band) throw new AuthError("Termin nicht gefunden.", 404);
    const time = (value: Date | null) => value?.toLocaleTimeString("de-DE", { timeZone: band.timezone, hour: "2-digit", minute: "2-digit" }) ?? null;
    const bytes = await renderRiderPdf({
      bandName: band.name,
      rider: parseRider(band.rider),
      contactEmail: band.contactEmail,
      event: {
        title: event.title,
        date: event.startsAt.toLocaleDateString("de-DE", { timeZone: band.timezone, weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }),
        venue: event.venueLabel,
        loadIn: time(event.loadInAt),
        soundcheck: time(event.soundcheckAt),
        doors: time(event.doorsAt),
      },
    });
    const name = `${band.name}-rider`.normalize("NFKD").replace(/[^\w-]+/g, "-").slice(0, 60);
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${request.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline"}; filename="${name}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return errorResponse(error, "Rider konnte nicht erstellt werden.");
  }
}
