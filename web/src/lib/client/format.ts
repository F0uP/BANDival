import type { AvailabilityStatus, EventKind, EventStatus, SongStatus } from "@/lib/client/types";
import { intlLocale, t, translatable } from "@/lib/i18n";

export function formatDuration(totalSeconds: number | null | undefined): string {
  if (!totalSeconds || totalSeconds <= 0 || !Number.isFinite(totalSeconds)) {
    return "–";
  }
  const safe = Math.floor(totalSeconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatTotalDuration(totalSeconds: number): string {
  if (!totalSeconds) {
    return "0 min";
  }
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);
  return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
}

export function formatBpm(value: string | number | null | undefined): string | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? `${Math.round(numeric)} BPM` : null;
}

export function formatBytes(bytes: number | string | null | undefined): string {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) {
    return "";
  }
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

/** Intl formatters follow the active UI language (cached per language). */
const formatterCache = new Map<string, Intl.DateTimeFormat>();
function dateFormatter(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const locale = intlLocale();
  const key = `${locale}|${JSON.stringify(options)}`;
  let formatter = formatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, options);
    formatterCache.set(key, formatter);
  }
  return formatter;
}

export const formatDate = (value: string | Date) => dateFormatter({ day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
export const formatDateLong = (value: string | Date) => dateFormatter({ weekday: "long", day: "numeric", month: "long" }).format(new Date(value));
export const formatDateShort = (value: string | Date) => dateFormatter({ weekday: "short", day: "numeric", month: "short" }).format(new Date(value));
export const formatTime = (value: string | Date) => dateFormatter({ hour: "2-digit", minute: "2-digit" }).format(new Date(value));
export const formatDateTime = (value: string | Date) => dateFormatter({ dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
export const formatMonth = (value: Date) => dateFormatter({ month: "long", year: "numeric" }).format(value);

export function formatTimeRange(start: string, end: string | null): string {
  return end ? `${formatTime(start)}–${formatTime(end)}` : formatTime(start);
}

const relativeCache = new Map<string, Intl.RelativeTimeFormat>();
function relativeFmt(): Intl.RelativeTimeFormat {
  const locale = intlLocale();
  let formatter = relativeCache.get(locale);
  if (!formatter) {
    formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    relativeCache.set(locale, formatter);
  }
  return formatter;
}

export function formatRelative(value: string | Date): string {
  const diffSeconds = (new Date(value).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diffSeconds);
  if (abs < 45) return t("gerade eben");
  if (abs < 3600) return relativeFmt().format(Math.round(diffSeconds / 60), "minute");
  if (abs < 86400) return relativeFmt().format(Math.round(diffSeconds / 3600), "hour");
  if (abs < 86400 * 7) return relativeFmt().format(Math.round(diffSeconds / 86400), "day");
  return formatDate(value);
}

/** Days from today (local) to the given date: 0 = today, 1 = tomorrow … */
export function daysUntil(value: string | Date): number {
  const target = new Date(value);
  const today = new Date();
  const a = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
  const b = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((a - b) / 86400000);
}

export function formatDayDistance(value: string | Date): string {
  const days = daysUntil(value);
  if (days === 0) return t("Heute");
  if (days === 1) return t("Morgen");
  if (days === -1) return t("Gestern");
  if (days > 1 && days < 7) return t("in {days} Tagen", { days });
  return formatDateShort(value);
}

export function initials(name: string | null | undefined): string {
  const clean = (name ?? "").trim();
  if (!clean) return "?";
  const parts = clean.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

/* ---------------------------------------------------------------------------- */
/* Local date keys (YYYY-MM-DD) for calendar grids                                */
/* ---------------------------------------------------------------------------- */

export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function fromDateKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

export function addDays(key: string, days: number): string {
  const date = fromDateKey(key);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

export function rangeKeys(fromKey: string, toKey: string): string[] {
  const keys: string[] = [];
  let cursor = fromKey <= toKey ? fromKey : toKey;
  const end = fromKey <= toKey ? toKey : fromKey;
  while (cursor <= end && keys.length < 400) {
    keys.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return keys;
}

/* ---------------------------------------------------------------------------- */
/* Labels                                                                       */
/* ---------------------------------------------------------------------------- */

export const SONG_STATUS_LABEL: Record<SongStatus, string> = translatable({
  draft: "Idee",
  review: "In Arbeit",
  approved: "Bühnenreif",
  archived: "Archiviert",
});

export const SONG_STATUS_ORDER: SongStatus[] = ["draft", "review", "approved", "archived"];

export const EVENT_KIND_LABEL: Record<EventKind, string> = translatable({
  rehearsal: "Probe",
  gig: "Gig",
  meeting: "Meeting",
  other: "Termin",
});

export const EVENT_STATUS_LABEL: Record<EventStatus, string> = translatable({
  planned: "Geplant",
  confirmed: "Bestätigt",
  cancelled: "Abgesagt",
});

export const AVAILABILITY_LABEL: Record<AvailabilityStatus, string> = translatable({
  available: "Kann",
  maybe: "Vielleicht",
  unavailable: "Kann nicht",
});

export const WEEKDAYS_SHORT = translatable(["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]);
