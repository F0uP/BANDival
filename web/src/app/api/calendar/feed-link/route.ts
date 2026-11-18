import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBandId } from "@/lib/api";
import { AuthError, requireAuthUser, signCalendarFeed } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { getAppBaseUrl } from "@/lib/mailer";

async function buildLink(memberId: string, version: number, request: NextRequest) {
  const base = process.env.APP_BASE_URL ? getAppBaseUrl() : request.nextUrl.origin;
  const token = `${memberId}.${signCalendarFeed(memberId, version)}`;
  const httpsUrl = `${base}/api/calendar/feed/${token}.ics`;
  return { url: httpsUrl, webcalUrl: httpsUrl.replace(/^https?:/, "webcal:") };
}

async function membership(request: NextRequest) {
  const session = await requireAuthUser(request);
  const bandId = parseBandId(request.nextUrl.searchParams.get("bandId"));
  const member = await prisma.bandMember.findUnique({
    where: { bandId_userId: { bandId, userId: session.userId } },
    select: { id: true, calendarFeedVersion: true, role: true },
  });
  if (!member || member.role === "guest") {
    throw new AuthError("Kein Zugriff auf diese Band.", 403);
  }
  return member;
}

/** Personal subscription link for the band calendar (Google/Apple/Outlook). */
export async function GET(request: NextRequest) {
  try {
    const member = await membership(request);
    return NextResponse.json(await buildLink(member.id, member.calendarFeedVersion, request));
  } catch (error) {
    return errorResponse(error);
  }
}

/** Invalidates the old link and returns a new one. */
export async function POST(request: NextRequest) {
  try {
    const member = await membership(request);
    const updated = await prisma.bandMember.update({
      where: { id: member.id },
      data: { calendarFeedVersion: { increment: 1 } },
      select: { id: true, calendarFeedVersion: true },
    });
    return NextResponse.json(await buildLink(updated.id, updated.calendarFeedVersion, request));
  } catch (error) {
    return errorResponse(error);
  }
}
