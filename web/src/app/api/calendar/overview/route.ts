import { after, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBandId } from "@/lib/api";
import { AuthError, requireAuthUser, requireBandMembership } from "@/lib/auth";
import { AvailabilityIndex, enrichEvents, loadAvailabilityContext, loadBandMembers, summarize } from "@/lib/availability";
import { syncStaleSources, SYNC_STALE_AFTER_MS } from "@/lib/calendar-sync";
import { addDaysToKey, dateKeyInZone, diffDays, eachDateKey, isDateKey, utcDateToKey, zonedTimeToUtc } from "@/lib/dates";
import { eventSelect } from "@/lib/events";
import { errorResponse, json } from "@/lib/http";

/**
 * Everything the calendar view needs for a date range:
 * events (with resolved availability), per-day availability of every member and the user's own busy blocks.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const params = request.nextUrl.searchParams;
    const bandId = parseBandId(params.get("bandId"));
    await requireBandMembership(session.userId, bandId);

    const fromKey = params.get("from") ?? "";
    const toKey = params.get("to") ?? "";
    if (!isDateKey(fromKey) || !isDateKey(toKey) || toKey < fromKey || diffDays(fromKey, toKey) > 62) {
      throw new AuthError("Ungültiger Zeitraum (max. 62 Tage).", 400);
    }

    const band = await prisma.band.findUnique({ where: { id: bandId }, select: { timezone: true } });
    const timeZone = band?.timezone ?? "Europe/Berlin";
    const rangeStart = zonedTimeToUtc(fromKey, "00:00", timeZone);
    const rangeEnd = zonedTimeToUtc(addDaysToKey(toKey, 1), "00:00", timeZone);

    const members = await loadBandMembers(bandId);
    const userIds = members.map((member) => member.userId);

    const [events, { dayEntries, blocks }, mySources] = await Promise.all([
      prisma.event.findMany({
        where: { bandId, status: { not: "availability_template" }, startsAt: { gte: rangeStart, lt: rangeEnd } },
        select: eventSelect,
        orderBy: { startsAt: "asc" },
      }),
      loadAvailabilityContext(userIds, { start: rangeStart, end: rangeEnd }),
      prisma.calendarSource.findMany({
        where: { userId: session.userId },
        select: { id: true, enabled: true, lastSyncedAt: true, lastError: true },
      }),
    ]);

    const index = new AvailabilityIndex(dayEntries, blocks, timeZone);
    const dateKeys = eachDateKey(fromKey, toKey);

    const days = Object.fromEntries(
      dateKeys.map((dateKey) => {
        const perMember = Object.fromEntries(
          members.map((member) => [member.userId, index.resolveDay(member.userId, dateKey)]),
        );
        return [
          dateKey,
          {
            mine: perMember[session.userId] ?? { status: null, source: null, partial: false },
            members: perMember,
            summary: summarize(Object.values(perMember).map((entry) => entry.status)),
            partialCount: Object.values(perMember).filter((entry) => entry.partial).length,
          },
        ];
      }),
    );

    // Own busy blocks with titles, grouped by local day (others only ever see "busy").
    const myBusy: Record<string, Array<{ start: string; end: string; allDay: boolean; title: string | null }>> = {};
    for (const block of blocks.filter((entry) => entry.userId === session.userId)) {
      const firstKey = block.allDay ? utcDateToKey(block.startsAt) : dateKeyInZone(block.startsAt, timeZone);
      const lastKey = block.allDay
        ? addDaysToKey(utcDateToKey(block.endsAt), -1)
        : dateKeyInZone(new Date(block.endsAt.getTime() - 1), timeZone);
      for (const key of eachDateKey(firstKey < fromKey ? fromKey : firstKey, lastKey > toKey ? toKey : lastKey, 62)) {
        (myBusy[key] ??= []).push({
          start: block.startsAt.toISOString(),
          end: block.endsAt.toISOString(),
          allDay: block.allDay,
          title: block.title,
        });
      }
    }

    const staleBefore = Date.now() - SYNC_STALE_AFTER_MS;
    if (mySources.length > 0 || members.length > 1) {
      after(() => syncStaleSources(userIds));
    }

    return json({
      timezone: timeZone,
      members,
      days,
      myBusy,
      events: enrichEvents(events, members, index, session.userId),
      sync: {
        sources: mySources.length,
        lastSyncedAt: mySources.reduce<Date | null>((latest, source) => (
          source.lastSyncedAt && (!latest || source.lastSyncedAt > latest) ? source.lastSyncedAt : latest
        ), null),
        hasErrors: mySources.some((source) => Boolean(source.lastError)),
        stale: mySources.some((source) => source.enabled && (!source.lastSyncedAt || source.lastSyncedAt.getTime() < staleBefore)),
      },
    });
  } catch (error) {
    return errorResponse(error, "Kalender konnte nicht geladen werden.");
  }
}
