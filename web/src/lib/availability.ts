import type { AvailabilityStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  addDaysToKey,
  dateKeyInZone,
  dateKeyToUtcDate,
  dayIntervalInZone,
  eachDateKey,
  isoWeekday,
  utcDateToKey,
  zonedTimeToUtc,
} from "@/lib/dates";

export type AvailabilitySource = "event" | "calendar" | "day";

export type ResolvedAvailability = {
  status: AvailabilityStatus | null;
  source: AvailabilitySource | null;
  note?: string | null;
};

export type BandMemberInfo = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  instrument: string | null;
  role: "owner" | "admin" | "member";
};

type BusyBlockLite = {
  userId: string;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  title: string | null;
};

type DayEntryLite = {
  userId: string;
  date: Date;
  status: AvailabilityStatus;
  note: string | null;
};

const DEFAULT_EVENT_DURATION_MS = 3 * 60 * 60 * 1000;

export function eventInterval(event: { startsAt: Date; endsAt: Date | null }): { start: Date; end: Date } {
  const end = event.endsAt && event.endsAt > event.startsAt
    ? event.endsAt
    : new Date(event.startsAt.getTime() + DEFAULT_EVENT_DURATION_MS);
  return { start: event.startsAt, end };
}

function blockCoversInterval(block: BusyBlockLite, start: Date, end: Date, timeZone: string): boolean {
  if (block.allDay) {
    const startKey = dateKeyInZone(start, timeZone);
    const lastKey = dateKeyInZone(new Date(end.getTime() - 1), timeZone);
    const blockStart = utcDateToKey(block.startsAt);
    const blockEnd = utcDateToKey(block.endsAt);
    // all-day blocks are [startKey, endKey) by date
    return blockStart <= lastKey && startKey < blockEnd;
  }
  return block.startsAt < end && block.endsAt > start;
}

/** Loads everything needed to resolve availabilities for a set of users in a time range. */
export async function loadAvailabilityContext(userIds: string[], range: { start: Date; end: Date }) {
  if (userIds.length === 0) {
    return { dayEntries: [] as DayEntryLite[], blocks: [] as BusyBlockLite[] };
  }

  const [dayEntries, blocks] = await Promise.all([
    prisma.userDayAvailability.findMany({
      where: {
        userId: { in: userIds },
        date: {
          gte: dateKeyToUtcDate(addDaysToKey(utcDateToKey(range.start), -1)),
          lte: dateKeyToUtcDate(addDaysToKey(utcDateToKey(range.end), 1)),
        },
      },
      select: { userId: true, date: true, status: true, note: true },
    }),
    prisma.calendarBusyBlock.findMany({
      where: {
        userId: { in: userIds },
        startsAt: { lt: new Date(range.end.getTime() + 86_400_000) },
        endsAt: { gt: new Date(range.start.getTime() - 86_400_000) },
        source: { enabled: true },
      },
      select: { userId: true, startsAt: true, endsAt: true, allDay: true, title: true },
      orderBy: { startsAt: "asc" },
    }),
  ]);

  return { dayEntries, blocks };
}

export class AvailabilityIndex {
  private dayByUser = new Map<string, Map<string, DayEntryLite>>();
  private blocksByUser = new Map<string, BusyBlockLite[]>();

  constructor(dayEntries: DayEntryLite[], blocks: BusyBlockLite[], private timeZone: string) {
    for (const entry of dayEntries) {
      const map = this.dayByUser.get(entry.userId) ?? new Map<string, DayEntryLite>();
      map.set(utcDateToKey(entry.date), entry);
      this.dayByUser.set(entry.userId, map);
    }
    for (const block of blocks) {
      const list = this.blocksByUser.get(block.userId) ?? [];
      list.push(block);
      this.blocksByUser.set(block.userId, list);
    }
  }

  dayEntry(userId: string, dateKey: string): DayEntryLite | undefined {
    return this.dayByUser.get(userId)?.get(dateKey);
  }

  blocksFor(userId: string, start: Date, end: Date): BusyBlockLite[] {
    return (this.blocksByUser.get(userId) ?? []).filter((block) => blockCoversInterval(block, start, end, this.timeZone));
  }

  /** Effective status of a member for a concrete time window (event or rehearsal slot). */
  resolveWindow(userId: string, start: Date, end: Date, explicit?: { status: AvailabilityStatus; note: string | null } | null): ResolvedAvailability {
    if (explicit) {
      return { status: explicit.status, source: "event", note: explicit.note };
    }

    const dateKey = dateKeyInZone(start, this.timeZone);
    const day = this.dayEntry(userId, dateKey);
    if (day?.status === "unavailable") {
      return { status: "unavailable", source: "day", note: day.note };
    }

    if (this.blocksFor(userId, start, end).length > 0) {
      return { status: "unavailable", source: "calendar" };
    }

    if (day) {
      return { status: day.status, source: "day", note: day.note };
    }

    return { status: null, source: null };
  }

  /** Status of a member for a whole day (calendar month view). */
  resolveDay(userId: string, dateKey: string): ResolvedAvailability & { partial: boolean } {
    const { start, end } = dayIntervalInZone(dateKey, this.timeZone);
    const blocks = this.blocksFor(userId, start, end);
    const allDayBlocked = blocks.some((block) => block.allDay || (block.startsAt <= start && block.endsAt >= end));
    const day = this.dayEntry(userId, dateKey);

    if (day) {
      return { status: day.status, source: "day", note: day.note, partial: !allDayBlocked && blocks.length > 0 };
    }
    if (allDayBlocked) {
      return { status: "unavailable", source: "calendar", partial: false };
    }
    return { status: null, source: null, partial: blocks.length > 0 };
  }
}

export type AvailabilitySummary = {
  available: number;
  maybe: number;
  unavailable: number;
  unknown: number;
  total: number;
};

export function summarize(statuses: Array<AvailabilityStatus | null>): AvailabilitySummary {
  const summary: AvailabilitySummary = { available: 0, maybe: 0, unavailable: 0, unknown: 0, total: statuses.length };
  for (const status of statuses) {
    if (status === "available") summary.available += 1;
    else if (status === "maybe") summary.maybe += 1;
    else if (status === "unavailable") summary.unavailable += 1;
    else summary.unknown += 1;
  }
  return summary;
}

export async function loadBandMembers(bandId: string): Promise<BandMemberInfo[]> {
  const members = await prisma.bandMember.findMany({
    // Guests (session musicians) are not part of the band's availability planning.
    where: { bandId, role: { not: "guest" } },
    orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
    include: { user: { select: { id: true, displayName: true, email: true, avatarUrl: true } } },
  });
  return members.map((member) => ({
    userId: member.userId,
    displayName: member.user.displayName || member.user.email,
    avatarUrl: member.user.avatarUrl,
    instrument: member.instrumentPrimary,
    role: member.role as BandMemberInfo["role"],
  }));
}

type EventWithAvailabilities = {
  id: string;
  startsAt: Date;
  endsAt: Date | null;
  availabilities: Array<{ userId: string; status: AvailabilityStatus; note: string | null }>;
};

/** Adds resolved per-member availability + summary to events. */
export function enrichEvents<T extends EventWithAvailabilities>(
  events: T[],
  members: BandMemberInfo[],
  index: AvailabilityIndex,
  currentUserId: string,
) {
  return events.map((event) => {
    const { start, end } = eventInterval(event);
    const explicitByUser = new Map(event.availabilities.map((entry) => [entry.userId, entry]));
    const memberStatuses = members.map((member) => ({
      userId: member.userId,
      ...index.resolveWindow(member.userId, start, end, explicitByUser.get(member.userId) ?? null),
    }));
    const mine = memberStatuses.find((entry) => entry.userId === currentUserId) ?? { status: null, source: null };
    const summary = summarize(memberStatuses.map((entry) => entry.status));
    const { availabilities: _availabilities, ...rest } = event;
    void _availabilities;

    return {
      ...rest,
      availability: {
        mine,
        members: memberStatuses,
        summary,
        hasConflict: summary.unavailable > 0,
      },
    };
  });
}

export type DateSuggestion = {
  date: string;
  start: string;
  end: string;
  available: number;
  maybe: number;
  unknown: number;
  blocked: number;
  total: number;
  score: number;
  blockedMembers: string[];
  hasBandEvent: boolean;
};

/** Ranks candidate dates for a rehearsal/gig based on everyone's availability. */
export async function suggestDates(args: {
  bandId: string;
  timeZone: string;
  fromKey: string;
  toKey: string;
  startTime: string;
  endTime: string;
  weekdays: number[];
  limit: number;
}): Promise<{ suggestions: DateSuggestion[]; members: BandMemberInfo[] }> {
  const members = await loadBandMembers(args.bandId);
  const dateKeys = eachDateKey(args.fromKey, args.toKey, 120).filter((key) => args.weekdays.includes(isoWeekday(key)));
  if (dateKeys.length === 0 || members.length === 0) {
    return { suggestions: [], members };
  }

  const rangeStart = zonedTimeToUtc(dateKeys[0], "00:00", args.timeZone);
  const rangeEnd = zonedTimeToUtc(addDaysToKey(dateKeys[dateKeys.length - 1], 2), "00:00", args.timeZone);
  const userIds = members.map((member) => member.userId);
  const [{ dayEntries, blocks }, bandEvents] = await Promise.all([
    loadAvailabilityContext(userIds, { start: rangeStart, end: rangeEnd }),
    prisma.event.findMany({
      where: { bandId: args.bandId, startsAt: { gte: rangeStart, lt: rangeEnd }, status: { notIn: ["cancelled", "availability_template"] } },
      select: { startsAt: true, endsAt: true },
    }),
  ]);
  const index = new AvailabilityIndex(dayEntries, blocks, args.timeZone);
  const overnight = args.endTime <= args.startTime;

  const suggestions = dateKeys.map((dateKey) => {
    const start = zonedTimeToUtc(dateKey, args.startTime, args.timeZone);
    const end = zonedTimeToUtc(overnight ? addDaysToKey(dateKey, 1) : dateKey, args.endTime, args.timeZone);
    let available = 0;
    let maybe = 0;
    let unknown = 0;
    let blocked = 0;
    const blockedMembers: string[] = [];

    for (const member of members) {
      const resolved = index.resolveWindow(member.userId, start, end);
      if (resolved.status === "unavailable") {
        blocked += 1;
        blockedMembers.push(member.displayName);
      } else if (resolved.status === "available") {
        available += 1;
      } else if (resolved.status === "maybe") {
        maybe += 1;
      } else {
        unknown += 1;
      }
    }

    const hasBandEvent = bandEvents.some((event) => {
      const interval = eventInterval(event);
      return interval.start < end && interval.end > start;
    });

    const score = available * 4 + maybe * 2 + unknown - blocked * 12 - (hasBandEvent ? 6 : 0);
    return {
      date: dateKey,
      start: start.toISOString(),
      end: end.toISOString(),
      available,
      maybe,
      unknown,
      blocked,
      total: members.length,
      score,
      blockedMembers,
      hasBandEvent,
    } satisfies DateSuggestion;
  });

  suggestions.sort((a, b) => b.score - a.score || a.date.localeCompare(b.date));
  return { suggestions: suggestions.slice(0, args.limit), members };
}
