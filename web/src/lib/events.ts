import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AuthError } from "@/lib/auth";
import { AvailabilityIndex, enrichEvents, eventInterval, loadAvailabilityContext, loadBandMembers } from "@/lib/availability";
import { addDaysToKey, dateKeyInZone, timeInZone, zonedTimeToUtc } from "@/lib/dates";

export const EVENT_STATUSES = ["planned", "confirmed", "cancelled"] as const;

const isoDateTime = z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Ungültiges Datum.");

export const eventFieldsSchema = z.object({
  title: z.string().trim().min(1, "Bitte einen Titel angeben.").max(200),
  kind: z.enum(["rehearsal", "gig", "meeting", "other"]).default("rehearsal"),
  startsAt: isoDateTime,
  endsAt: isoDateTime.nullable().optional(),
  venueLabel: z.string().trim().max(300).nullable().optional(),
  notes: z.string().max(3000).nullable().optional(),
  status: z.enum(EVENT_STATUSES).default("planned"),
  setlistId: z.string().uuid().nullable().optional(),
});

export const eventSelect = {
  id: true,
  bandId: true,
  title: true,
  kind: true,
  startsAt: true,
  endsAt: true,
  venueLabel: true,
  notes: true,
  status: true,
  setlistId: true,
  recurrenceGroupId: true,
  recurrenceEveryDays: true,
  recurrenceCount: true,
  createdAt: true,
  updatedAt: true,
  setlist: { select: { id: true, name: true } },
  availabilities: { select: { userId: true, status: true, note: true } },
} as const;

export async function assertSetlistInBand(bandId: string, setlistId: string | null | undefined): Promise<void> {
  if (!setlistId) {
    return;
  }
  const count = await prisma.setlist.count({ where: { id: setlistId, bandId } });
  if (!count) {
    throw new AuthError("Die Setlist gehört nicht zu dieser Band.", 400);
  }
}

/** Shifts a start instant by N days keeping the local wall-clock time in the band timezone (DST-safe). */
export function shiftKeepingLocalTime(start: Date, days: number, timeZone: string): Date {
  if (days === 0) {
    return start;
  }
  const dateKey = dateKeyInZone(start, timeZone);
  const time = timeInZone(start, timeZone);
  return zonedTimeToUtc(addDaysToKey(dateKey, days), time, timeZone);
}

export async function loadEnrichedEvents(args: {
  bandId: string;
  timeZone: string;
  userId: string;
  from?: Date;
  to?: Date;
  limit?: number;
  includeCancelled?: boolean;
}) {
  const events = await prisma.event.findMany({
    where: {
      bandId: args.bandId,
      status: args.includeCancelled === false ? { notIn: ["availability_template", "cancelled"] } : { not: "availability_template" },
      ...(args.from || args.to
        ? { startsAt: { ...(args.from ? { gte: args.from } : {}), ...(args.to ? { lt: args.to } : {}) } }
        : {}),
    },
    select: eventSelect,
    orderBy: { startsAt: "asc" },
    take: args.limit ?? 500,
  });

  if (events.length === 0) {
    return [];
  }

  const members = await loadBandMembers(args.bandId);
  const start = events[0].startsAt;
  const end = eventInterval(events[events.length - 1]).end;
  const { dayEntries, blocks } = await loadAvailabilityContext(members.map((member) => member.userId), { start, end });
  const index = new AvailabilityIndex(dayEntries, blocks, args.timeZone);
  return enrichEvents(events, members, index, args.userId);
}
