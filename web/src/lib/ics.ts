import ICAL from "ical.js";

/* ------------------------------------------------------------------ */
/* Import                                                              */
/* ------------------------------------------------------------------ */

export type ParsedBusyBlock = {
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  title: string | null;
};

const MAX_OCCURRENCES_PER_EVENT = 800;
const MAX_BLOCKS = 5000;

function timeToDate(time: InstanceType<typeof ICAL.Time>): Date {
  if (time.isDate) {
    // all-day values are floating dates – keep them as UTC midnight of that calendar date
    return new Date(Date.UTC(time.year, time.month - 1, time.day));
  }
  return time.toJSDate();
}

/**
 * Parses an iCalendar document and returns busy intervals within [windowStart, windowEnd].
 * Recurring events are expanded, transparent ("free") and cancelled events are skipped.
 */
export function parseIcsBusyBlocks(icsText: string, windowStart: Date, windowEnd: Date): ParsedBusyBlock[] {
  const jcal = ICAL.parse(icsText);
  const root = new ICAL.Component(jcal);
  const calendars = root.name === "vcalendar" ? [root] : root.getAllSubcomponents("vcalendar");

  const blocks: ParsedBusyBlock[] = [];
  const rangeStart = ICAL.Time.fromJSDate(windowStart, true);
  const rangeEnd = ICAL.Time.fromJSDate(windowEnd, true);

  for (const calendar of calendars) {
    for (const vtimezone of calendar.getAllSubcomponents("vtimezone")) {
      try {
        ICAL.TimezoneService.register(vtimezone);
      } catch {
        // ignore malformed timezone definitions
      }
    }

    const vevents = calendar.getAllSubcomponents("vevent");
    const masters = new Map<string, InstanceType<typeof ICAL.Event>>();
    const exceptions: Array<InstanceType<typeof ICAL.Event>> = [];

    for (const vevent of vevents) {
      const event = new ICAL.Event(vevent);
      if (event.isRecurrenceException()) {
        exceptions.push(event);
      } else if (event.uid) {
        masters.set(event.uid, event);
      } else {
        masters.set(`anon-${masters.size}`, event);
      }
    }

    for (const exception of exceptions) {
      const master = exception.uid ? masters.get(exception.uid) : undefined;
      if (master) {
        try {
          master.relateException(exception);
        } catch {
          // ignore broken exceptions
        }
      } else {
        masters.set(`exception-${masters.size}`, exception);
      }
    }

    const isFree = (component: InstanceType<typeof ICAL.Component>) => {
      const transp = String(component.getFirstPropertyValue("transp") ?? "").toUpperCase();
      const status = String(component.getFirstPropertyValue("status") ?? "").toUpperCase();
      return transp === "TRANSPARENT" || status === "CANCELLED";
    };

    const pushBlock = (start: InstanceType<typeof ICAL.Time>, end: InstanceType<typeof ICAL.Time> | null, title: string | null) => {
      const startsAt = timeToDate(start);
      let endsAt = end ? timeToDate(end) : null;
      if (!endsAt || endsAt <= startsAt) {
        endsAt = start.isDate ? new Date(startsAt.getTime() + 86_400_000) : new Date(startsAt.getTime() + 60 * 60 * 1000);
      }
      if (endsAt < windowStart || startsAt > windowEnd) {
        return;
      }
      blocks.push({ startsAt, endsAt, allDay: start.isDate, title: title?.slice(0, 200) || null });
    };

    for (const event of masters.values()) {
      if (blocks.length >= MAX_BLOCKS) {
        break;
      }
      if (!event.startDate) {
        continue;
      }

      if (!event.isRecurring()) {
        if (!isFree(event.component)) {
          pushBlock(event.startDate, event.endDate, event.summary);
        }
        continue;
      }

      const iterator = event.iterator();
      let next: InstanceType<typeof ICAL.Time> | null;
      let count = 0;
      while ((next = iterator.next()) && count < MAX_OCCURRENCES_PER_EVENT && blocks.length < MAX_BLOCKS) {
        count += 1;
        if (next.compare(rangeEnd) > 0) {
          break;
        }
        const details = event.getOccurrenceDetails(next);
        if (details.endDate.compare(rangeStart) < 0) {
          continue;
        }
        if (isFree(details.item.component)) {
          continue;
        }
        pushBlock(details.startDate, details.endDate, details.item.summary);
      }
    }
  }

  return blocks;
}

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

function escapeText(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replace(/\r?\n/g, "\\n");
}

function formatUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Folds lines to 75 octets as required by RFC 5545. */
function foldLine(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) {
    return line;
  }
  const chunks: string[] = [];
  let current = "";
  let currentBytes = 0;
  for (const char of line) {
    const charBytes = Buffer.byteLength(char, "utf8");
    const limit = chunks.length === 0 ? 75 : 74;
    if (currentBytes + charBytes > limit) {
      chunks.push(current);
      current = "";
      currentBytes = 0;
    }
    current += char;
    currentBytes += charBytes;
  }
  chunks.push(current);
  return chunks.join("\r\n ");
}

export type IcsExportEvent = {
  id: string;
  title: string;
  kind: string;
  startsAt: Date;
  endsAt: Date | null;
  venueLabel: string | null;
  notes: string | null;
  status: string;
  updatedAt: Date;
  url?: string;
};

const KIND_PREFIX: Record<string, string> = {
  rehearsal: "Probe",
  gig: "Gig",
  meeting: "Meeting",
  other: "",
};

export function buildIcsCalendar(args: { name: string; events: IcsExportEvent[]; host: string }): string {
  const now = formatUtc(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Bandival//Band Calendar//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(args.name)}`,
    "X-PUBLISHED-TTL:PT1H",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
  ];

  for (const event of args.events) {
    const end = event.endsAt && event.endsAt > event.startsAt ? event.endsAt : new Date(event.startsAt.getTime() + 3 * 60 * 60 * 1000);
    const prefix = KIND_PREFIX[event.kind] ?? "";
    const summary = prefix && !event.title.toLowerCase().includes(prefix.toLowerCase()) ? `${prefix}: ${event.title}` : event.title;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.id}@${args.host}`,
      `DTSTAMP:${now}`,
      `LAST-MODIFIED:${formatUtc(event.updatedAt)}`,
      `DTSTART:${formatUtc(event.startsAt)}`,
      `DTEND:${formatUtc(end)}`,
      `SUMMARY:${escapeText(summary)}`,
      `STATUS:${event.status === "cancelled" ? "CANCELLED" : event.status === "confirmed" ? "CONFIRMED" : "TENTATIVE"}`,
    );
    if (event.venueLabel) {
      lines.push(`LOCATION:${escapeText(event.venueLabel)}`);
    }
    if (event.notes) {
      lines.push(`DESCRIPTION:${escapeText(event.notes)}`);
    }
    if (event.url) {
      lines.push(`URL:${event.url}`);
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}
