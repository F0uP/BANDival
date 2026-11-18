import { NextRequest, NextResponse } from "next/server";
import { buildIcsCalendar } from "@/lib/ics";
import { getAppBaseUrl } from "@/lib/mailer";
import { loadPublicBand } from "@/lib/public-band";

/** Public concert calendar (ICS) – fans can subscribe. Only public gigs, no internal notes. */
export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const slug = (await context.params).slug.replace(/\.ics$/i, "");
  const data = await loadPublicBand(slug);
  if (!data) return new NextResponse("Not found", { status: 404 });
  const baseUrl = process.env.APP_BASE_URL ? getAppBaseUrl() : request.nextUrl.origin;
  const body = buildIcsCalendar({
    name: `${data.band.name} – Konzerte`,
    host: new URL(baseUrl).hostname || "bandival",
    events: data.gigs.map((gig) => ({
      id: gig.id, title: `${data.band.name}: ${gig.title}`, kind: "gig" as const, startsAt: gig.startsAt, endsAt: gig.endsAt,
      venueLabel: gig.venueLabel, notes: null, status: gig.status, updatedAt: gig.updatedAt, url: `${baseUrl}/b/${data.band.slug}`,
    })),
  });
  return new NextResponse(body, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "public, max-age=900" } });
}
