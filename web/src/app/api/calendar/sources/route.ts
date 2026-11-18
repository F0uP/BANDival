import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AuthError, requireAuthUser } from "@/lib/auth";
import { normalizeCalendarUrl, syncCalendarSource } from "@/lib/calendar-sync";
import { presentSource, sourceSelect } from "@/lib/calendar-sources";
import { errorResponse } from "@/lib/http";

const createSchema = z.object({
  label: z.string().trim().min(1, "Bitte einen Namen angeben.").max(80),
  url: z.string().trim().min(8, "Bitte die iCal-Adresse einfügen.").max(2000),
});

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const sources = await prisma.calendarSource.findMany({
      where: { userId: session.userId },
      select: sourceSelect,
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ sources: sources.map(presentSource) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const payload = createSchema.parse(await request.json());
    const url = normalizeCalendarUrl(payload.url).toString();

    const count = await prisma.calendarSource.count({ where: { userId: session.userId } });
    if (count >= 10) {
      throw new AuthError("Maximal 10 Kalender pro Person.", 400);
    }

    const source = await prisma.calendarSource.create({
      data: { userId: session.userId, label: payload.label, kind: "ics_url", url },
    });

    const result = await syncCalendarSource(source.id);
    if (!result.ok) {
      // Keep nothing half-configured: a source that never synced successfully is removed again.
      await prisma.calendarSource.delete({ where: { id: source.id } });
      throw new AuthError(result.error ?? "Kalender konnte nicht abgerufen werden.", 400);
    }

    const saved = await prisma.calendarSource.findUniqueOrThrow({ where: { id: source.id }, select: sourceSelect });
    return NextResponse.json({ source: presentSource(saved), imported: result.count }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Kalender konnte nicht verbunden werden.");
  }
}
