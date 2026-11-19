import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AuthError } from "@/lib/auth";
import { HttpError } from "@/lib/http";
import { dateKeyInZone, dateKeyToUtcDate, diffDays, eachDateKey, isDateKey, timeInZone, utcDateToKey } from "@/lib/dates";
import { toWinAnsi } from "@/lib/setlist-pdf";

/** Tour planning: gigs of a period plus travel, accommodation, meals and appointments – day by day. */

export const TOUR_ITEM_KINDS = ["travel", "accommodation", "meal", "appointment", "note"] as const;
export type TourItemKind = (typeof TOUR_ITEM_KINDS)[number];

const dateKey = z.string().refine(isDateKey, "Ungültiges Datum.");

export const tourInputSchema = z.object({
  name: z.string().trim().min(1, "Bitte einen Namen angeben.").max(120),
  startsOn: dateKey,
  endsOn: dateKey,
  notes: z.string().max(5000).nullable().optional(),
}).refine((value) => value.endsOn >= value.startsOn, { message: "Das Ende muss nach dem Beginn liegen.", path: ["endsOn"] })
  .refine((value) => diffDays(value.startsOn, value.endsOn) <= 180, { message: "Eine Tour kann höchstens 180 Tage lang sein.", path: ["endsOn"] });

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional().transform((value) => value || null);

export const tourItemSchema = z.object({
  kind: z.enum(TOUR_ITEM_KINDS),
  title: z.string().trim().min(1, "Bitte einen Titel angeben.").max(160),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }).nullable().optional(),
  location: optionalText(200),
  toLocation: optionalText(200),
  details: optionalText(3000),
  bookingRef: optionalText(80),
  costCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
  distanceKm: z.number().int().min(0).max(20_000).nullable().optional(),
}).refine((value) => !value.endsAt || value.endsAt >= value.startsAt, { message: "Das Ende muss nach dem Beginn liegen.", path: ["endsAt"] });

export async function loadTourForUser(tourId: string, userId: string) {
  const tour = await prisma.tour.findUnique({ where: { id: tourId } });
  if (!tour) throw new AuthError("Tour nicht gefunden.", 404);
  const member = await prisma.bandMember.findUnique({ where: { bandId_userId: { bandId: tour.bandId, userId } }, select: { role: true } });
  if (!member || member.role === "guest") throw new AuthError("Tour nicht gefunden.", 404);
  return { tour, role: member.role };
}

const eventSelect = {
  id: true, title: true, kind: true, status: true, startsAt: true, endsAt: true, venueLabel: true, loadInAt: true, soundcheckAt: true, doorsAt: true,
  contactName: true, contactPhone: true, contactEmail: true, feeCents: true, setlist: { select: { id: true, name: true } },
} as const;

export function presentTour(tour: { id: string; bandId: string; name: string; startsOn: Date; endsOn: Date; notes: string | null; createdAt: Date; updatedAt: Date }) {
  return { ...tour, startsOn: utcDateToKey(tour.startsOn), endsOn: utcDateToKey(tour.endsOn) };
}

export async function tourDetail(tourId: string) {
  const tour = await prisma.tour.findUniqueOrThrow({ where: { id: tourId }, include: { band: { select: { timezone: true, name: true } } } });
  const startsOn = utcDateToKey(tour.startsOn);
  const endsOn = utcDateToKey(tour.endsOn);
  const [events, items, candidates] = await Promise.all([
    prisma.event.findMany({ where: { tourId }, orderBy: { startsAt: "asc" }, select: eventSelect }),
    prisma.tourItem.findMany({ where: { tourId }, orderBy: { startsAt: "asc" } }),
    // Events of the band in the tour period (±1 day) that are not part of another tour – offered for assignment
    prisma.event.findMany({
      where: {
        bandId: tour.bandId,
        startsAt: { gte: new Date(tour.startsOn.getTime() - 86_400_000), lt: new Date(tour.endsOn.getTime() + 2 * 86_400_000) },
        status: { notIn: ["availability_template"] },
        OR: [{ tourId: null }, { tourId }],
      },
      orderBy: { startsAt: "asc" },
      select: { id: true, title: true, kind: true, startsAt: true, venueLabel: true, tourId: true },
    }),
  ]);
  const totals = {
    gigs: events.filter((event) => event.kind === "gig" && event.status !== "cancelled").length,
    days: diffDays(startsOn, endsOn) + 1,
    distanceKm: items.reduce((sum, item) => sum + (item.distanceKm ?? 0), 0),
    costCents: items.reduce((sum, item) => sum + (item.costCents ?? 0), 0),
    feeCents: events.reduce((sum, event) => sum + (event.status !== "cancelled" ? event.feeCents ?? 0 : 0), 0),
  };
  return { tour: { ...presentTour(tour), timezone: tour.band.timezone, bandName: tour.band.name }, events, items, candidates, totals };
}

export async function assertEventsOfBand(bandId: string, eventIds: string[]) {
  if (eventIds.length === 0) return;
  const count = await prisma.event.count({ where: { id: { in: eventIds }, bandId } });
  if (count !== new Set(eventIds).size) throw new HttpError("Mindestens ein Termin gehört nicht zu dieser Band.", 400);
}

export function dateRange(startsOn: string, endsOn: string) {
  return { startsOn: dateKeyToUtcDate(startsOn), endsOn: dateKeyToUtcDate(endsOn) };
}

/* ---------------------------------------------------------------- itinerary PDF */

type Translate = (text: string, values?: Record<string, string | number>) => string;
type Detail = Awaited<ReturnType<typeof tourDetail>>;
type Entry = { at: Date; time: string; title: string; lines: string[]; kind: string };

function entriesByDay(detail: Detail, t: Translate, intl: string): Map<string, Entry[]> {
  const zone = detail.tour.timezone;
  const days = new Map<string, Entry[]>();
  const add = (at: Date | null, entry: Omit<Entry, "at" | "time">) => {
    if (!at) return;
    const key = dateKeyInZone(at, zone);
    days.set(key, [...(days.get(key) ?? []), { ...entry, at, time: timeInZone(at, zone) }]);
  };
  const money = (cents: number) => new Intl.NumberFormat(intl, { style: "currency", currency: "EUR" }).format(cents / 100);

  for (const event of detail.events) {
    if (event.status === "cancelled") continue;
    const place = event.venueLabel ? ` · ${event.venueLabel}` : "";
    const contact = [event.contactName, event.contactPhone].filter(Boolean).join(" · ");
    add(event.loadInAt, { kind: "gig", title: t("Load-in{place}", { place }), lines: contact ? [t("Kontakt: {contact}", { contact })] : [] });
    add(event.soundcheckAt, { kind: "gig", title: t("Soundcheck"), lines: [] });
    add(event.doorsAt, { kind: "gig", title: t("Einlass"), lines: [] });
    add(event.startsAt, {
      kind: "gig",
      title: `${event.kind === "gig" ? t("Gig") : event.kind === "rehearsal" ? t("Probe") : t("Termin")}: ${event.title}${place}`,
      lines: [
        event.endsAt ? t("bis {time}", { time: timeInZone(event.endsAt, zone) }) : "",
        event.setlist ? t("Setlist: {name}", { name: event.setlist.name }) : "",
      ].filter(Boolean),
    });
  }
  for (const item of detail.items) {
    const cost = item.costCents ? money(item.costCents) : "";
    const meta = [item.bookingRef ? t("Buchung: {ref}", { ref: item.bookingRef }) : "", cost].filter(Boolean).join(" · ");
    if (item.kind === "travel") {
      const route = [item.location, item.toLocation].filter(Boolean).join(" → ");
      add(item.startsAt, {
        kind: "travel",
        title: t("Abfahrt: {title}", { title: item.title }),
        lines: [route + (item.distanceKm ? ` (${item.distanceKm} km)` : ""), item.endsAt ? t("Ankunft ca. {time}", { time: timeInZone(item.endsAt, zone) }) : "", meta, item.details ?? ""].filter(Boolean),
      });
    } else if (item.kind === "accommodation") {
      add(item.startsAt, { kind: "accommodation", title: t("Check-in: {title}", { title: item.title }), lines: [item.location ?? "", meta, item.details ?? ""].filter(Boolean) });
      add(item.endsAt ?? null, { kind: "accommodation", title: t("Check-out: {title}", { title: item.title }), lines: [] });
    } else {
      add(item.startsAt, {
        kind: item.kind,
        title: item.title,
        lines: [[item.location, item.endsAt ? t("bis {time}", { time: timeInZone(item.endsAt, zone) }) : ""].filter(Boolean).join(" · "), meta, item.details ?? ""].filter(Boolean),
      });
    }
  }
  for (const entries of days.values()) entries.sort((a, b) => a.at.getTime() - b.at.getTime());
  return days;
}

const MM = 2.8346;
const A4: [number, number] = [210 * MM, 297 * MM];
const INK = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.42, 0.42, 0.47);
const LINE = rgb(0.86, 0.86, 0.89);
const KIND_COLOR: Record<string, ReturnType<typeof rgb>> = {
  gig: rgb(0.94, 0.32, 0.1), travel: rgb(0.13, 0.5, 0.86), accommodation: rgb(0.45, 0.33, 0.8), meal: rgb(0.2, 0.62, 0.36), appointment: rgb(0.85, 0.6, 0.1), note: rgb(0.55, 0.55, 0.6),
};

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = toWinAnsi(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > width && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

export async function renderTourPdf(detail: Detail, t: Translate, intl: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(toWinAnsi(`${detail.tour.name} – ${detail.tour.bandName}`));
  pdf.setCreator("Bandival");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const left = 20 * MM;
  const right = A4[0] - 20 * MM;
  let page: PDFPage = pdf.addPage(A4);
  let y = A4[1] - 22 * MM;
  const text = (value: string, x: number, size = 10, face = font, color = INK) => page.drawText(toWinAnsi(value), { x, y, size, font: face, color });
  const ensure = (height: number) => {
    if (y - height < 20 * MM) {
      page = pdf.addPage(A4);
      y = A4[1] - 20 * MM;
    }
  };
  const dayLabel = (key: string) => dateKeyToUtcDate(key).toLocaleDateString(intl, { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" });

  text(detail.tour.bandName.toUpperCase(), left, 9, bold, MUTED);
  y -= 22;
  text(detail.tour.name, left, 22, bold);
  y -= 18;
  text(`${dayLabel(detail.tour.startsOn)} – ${dayLabel(detail.tour.endsOn)}`, left, 10, font, MUTED);
  y -= 14;
  const summary = [
    t("{count} Gigs", { count: detail.totals.gigs }),
    t("{count} Tage", { count: detail.totals.days }),
    detail.totals.distanceKm ? `${detail.totals.distanceKm} km` : "",
    detail.totals.costCents ? t("Kosten {amount}", { amount: new Intl.NumberFormat(intl, { style: "currency", currency: "EUR" }).format(detail.totals.costCents / 100) }) : "",
  ].filter(Boolean).join(" · ");
  text(summary, left, 10, font, MUTED);
  y -= 10;
  if (detail.tour.notes) {
    for (const line of wrap(detail.tour.notes, font, 9.5, right - left)) {
      y -= 13;
      ensure(13);
      text(line, left, 9.5, font, MUTED);
    }
  }
  y -= 18;

  const days = entriesByDay(detail, t, intl);
  for (const key of eachDateKey(detail.tour.startsOn, detail.tour.endsOn)) {
    const entries = days.get(key) ?? [];
    ensure(40);
    page.drawLine({ start: { x: left, y: y + 12 }, end: { x: right, y: y + 12 }, thickness: 0.6, color: LINE });
    text(dayLabel(key), left, 12, bold);
    y -= 18;
    if (entries.length === 0) {
      text(t("Freier Tag"), left + 16 * MM, 9.5, font, MUTED);
      y -= 18;
      continue;
    }
    for (const entry of entries) {
      const lines = entry.lines.flatMap((line) => wrap(line, font, 9, right - left - 18 * MM));
      ensure(16 + lines.length * 11);
      page.drawCircle({ x: left + 13.5 * MM, y: y + 3.5, size: 2.4, color: KIND_COLOR[entry.kind] ?? MUTED });
      text(entry.time, left, 10, bold, MUTED);
      for (const [index, line] of wrap(entry.title, bold, 10.5, right - left - 18 * MM).entries()) {
        page.drawText(line, { x: left + 18 * MM, y: y - index * 13, size: 10.5, font: bold, color: INK });
        if (index > 0) y -= 13;
      }
      y -= 13;
      for (const line of lines) {
        page.drawText(line, { x: left + 18 * MM, y, size: 9, font, color: MUTED });
        y -= 11;
      }
      y -= 6;
    }
    y -= 8;
  }

  const pages = pdf.getPages();
  pages.forEach((target, index) => {
    const label = `${detail.tour.name} · ${index + 1}/${pages.length}`;
    target.drawText(toWinAnsi(label), { x: right - font.widthOfTextAtSize(toWinAnsi(label), 7), y: 10 * MM, size: 7, font, color: MUTED });
  });
  return pdf.save();
}
