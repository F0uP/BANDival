import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { safeEqual, signCalendarFeed } from "@/lib/auth";
import { buildIcsCalendar } from "@/lib/ics";
import { getAppBaseUrl } from "@/lib/mailer";

export const dynamic = "force-dynamic";

/** Public, token-protected iCalendar feed of a band's events (for calendar app subscriptions). */
export async function GET(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const raw = (await context.params).token.replace(/\.ics$/i, "");
  const [memberId, signature] = raw.split(".");

  if (!memberId || !signature || !/^[0-9a-f-]{36}$/i.test(memberId)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const member = await prisma.bandMember.findUnique({
    where: { id: memberId },
    select: { id: true, calendarFeedVersion: true, bandId: true, role: true, band: { select: { name: true } } },
  });
  if (!member || member.role === "guest" || !safeEqual(signCalendarFeed(member.id, member.calendarFeedVersion), signature)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const events = await prisma.event.findMany({
    where: { bandId: member.bandId, status: { not: "availability_template" }, startsAt: { gte: since } },
    orderBy: { startsAt: "asc" },
    take: 1000,
    select: { id: true, title: true, kind: true, startsAt: true, endsAt: true, venueLabel: true, notes: true, status: true, updatedAt: true },
  });

  const baseUrl = process.env.APP_BASE_URL ? getAppBaseUrl() : request.nextUrl.origin;
  const host = new URL(baseUrl).hostname || "bandival";
  const body = buildIcsCalendar({
    name: `${member.band.name} (Bandival)`,
    host,
    events: events.map((event) => ({ ...event, url: `${baseUrl}/app/calendar` })),
  });

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="bandival.ics"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
