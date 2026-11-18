/** Timezone-aware date helpers that work without external libraries (server + client safe). */

export const DEFAULT_TIMEZONE = process.env.APP_TIMEZONE ?? "Europe/Berlin";

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateKey(value: string): boolean {
  return DATE_KEY_RE.test(value);
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

function zonedParts(date: Date, timeZone: string) {
  const parts = partsFormatter(timeZone).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
  };
}

/** Calendar date (YYYY-MM-DD) of an instant in the given timezone. */
export function dateKeyInZone(date: Date, timeZone: string): string {
  const { year, month, day } = zonedParts(date, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Wall-clock time (HH:MM) of an instant in the given timezone. */
export function timeInZone(date: Date, timeZone: string): string {
  const { hour, minute } = zonedParts(date, timeZone);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function zoneOffsetMs(instant: number, timeZone: string): number {
  const { year, month, day, hour, minute, second } = zonedParts(new Date(instant), timeZone);
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** Converts a wall-clock time in a timezone to the corresponding UTC instant. */
export function zonedTimeToUtc(dateKey: string, time: string, timeZone: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const guess = Date.UTC(year, (month ?? 1) - 1, day ?? 1, hour ?? 0, minute ?? 0);
  const firstOffset = zoneOffsetMs(guess, timeZone);
  let result = guess - firstOffset;
  const secondOffset = zoneOffsetMs(result, timeZone);
  if (secondOffset !== firstOffset) {
    result = guess - secondOffset;
  }
  return new Date(result);
}

/** UTC-midnight Date for a YYYY-MM-DD key (used for @db.Date columns). */
export function dateKeyToUtcDate(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

export function utcDateToKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDaysToKey(dateKey: string, days: number): string {
  const date = dateKeyToUtcDate(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return utcDateToKey(date);
}

export function diffDays(fromKey: string, toKey: string): number {
  return Math.round((dateKeyToUtcDate(toKey).getTime() - dateKeyToUtcDate(fromKey).getTime()) / 86_400_000);
}

export function eachDateKey(fromKey: string, toKeyInclusive: string, max = 400): string[] {
  const out: string[] = [];
  let cursor = fromKey;
  while (cursor <= toKeyInclusive && out.length < max) {
    out.push(cursor);
    cursor = addDaysToKey(cursor, 1);
  }
  return out;
}

/** ISO weekday 1 (Mon) … 7 (Sun) for a date key. */
export function isoWeekday(dateKey: string): number {
  const day = dateKeyToUtcDate(dateKey).getUTCDay();
  return day === 0 ? 7 : day;
}

/** UTC interval [start, end) covering a whole calendar day in the given timezone. */
export function dayIntervalInZone(dateKey: string, timeZone: string): { start: Date; end: Date } {
  return {
    start: zonedTimeToUtc(dateKey, "00:00", timeZone),
    end: zonedTimeToUtc(addDaysToKey(dateKey, 1), "00:00", timeZone),
  };
}
