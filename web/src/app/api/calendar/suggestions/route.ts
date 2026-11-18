import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseBandId } from "@/lib/api";
import { AuthError, requireAuthUser, requireBandMembership } from "@/lib/auth";
import { suggestDates } from "@/lib/availability";
import { addDaysToKey, dateKeyInZone, diffDays } from "@/lib/dates";
import { errorResponse } from "@/lib/http";

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  days: z.coerce.number().int().min(1).max(90).default(28),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).default("19:00"),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).default("22:00"),
  weekdays: z.string().regex(/^[1-7](,[1-7])*$/).default("1,2,3,4,5,6,7"),
  limit: z.coerce.number().int().min(1).max(40).default(10),
});

/** "Terminfinder": ranks dates where most band members are free in the given time window. */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const params = request.nextUrl.searchParams;
    const bandId = parseBandId(params.get("bandId"));
    await requireBandMembership(session.userId, bandId);

    const parsed = querySchema.parse(Object.fromEntries(params.entries()));
    const band = await prisma.band.findUnique({ where: { id: bandId }, select: { timezone: true } });
    const timeZone = band?.timezone ?? "Europe/Berlin";
    const todayKey = dateKeyInZone(new Date(), timeZone);
    const fromKey = parsed.from && parsed.from > todayKey ? parsed.from : todayKey;
    const toKey = addDaysToKey(fromKey, parsed.days - 1);
    if (diffDays(fromKey, toKey) > 90) {
      throw new AuthError("Zeitraum zu groß.", 400);
    }

    const result = await suggestDates({
      bandId,
      timeZone,
      fromKey,
      toKey,
      startTime: parsed.startTime,
      endTime: parsed.endTime,
      weekdays: parsed.weekdays.split(",").map(Number),
      limit: parsed.limit,
    });

    return NextResponse.json({ timezone: timeZone, from: fromKey, to: toKey, ...result });
  } catch (error) {
    return errorResponse(error, "Terminvorschläge konnten nicht berechnet werden.");
  }
}
