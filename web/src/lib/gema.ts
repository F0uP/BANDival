import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/http";
import { toWinAnsi } from "@/lib/setlist-pdf";

/**
 * GEMA set list ("Musikfolge") for a gig: every work that was played with composer, lyricist, publisher,
 * work number and duration. The PDF mirrors the fields of the GEMA form so it can be copied into the
 * GEMA online portal or handed to the promoter; the CSV opens in any spreadsheet.
 */

export type GemaRow = {
  position: number;
  title: string;
  composers: string;
  lyricists: string;
  publisher: string;
  gemaWorkNumber: string;
  durationSeconds: number | null;
  /** Composer missing – the GEMA cannot assign the work without it. */
  incomplete: boolean;
};

export type GemaList = {
  bandName: string;
  event: { title: string; date: string; start: string; end: string | null; venue: string | null; promoter: string | null };
  source: "played" | "setlist";
  rows: GemaRow[];
  totalSeconds: number;
};

const songSelect = { id: true, title: true, composers: true, lyricists: true, publisher: true, gemaWorkNumber: true, durationSeconds: true } as const;

export async function loadGemaList(eventId: string): Promise<GemaList> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      band: { select: { name: true, timezone: true } },
      setlist: { include: { items: { orderBy: { position: "asc" }, include: { song: { select: songSelect } } } } },
      logSongs: { include: { song: { select: songSelect } } },
    },
  });
  if (!event) throw new HttpError("Termin nicht gefunden.", 404);
  const timeZone = event.band.timezone;
  const setlistOrder = new Map((event.setlist?.items ?? []).map((item, index) => [item.songId, index]));

  // What was actually played (gig log) wins over what was planned (setlist).
  const played = [...event.logSongs].sort((a, b) => (setlistOrder.get(a.songId) ?? 999) - (setlistOrder.get(b.songId) ?? 999) || a.song.title.localeCompare(b.song.title));
  const songs = played.length > 0
    ? played.map((entry) => ({ song: entry.song, duration: entry.song.durationSeconds }))
    : (event.setlist?.items ?? []).map((item) => ({ song: item.song, duration: item.customDurationSeconds ?? item.song.durationSeconds }));

  const rows: GemaRow[] = songs.map(({ song, duration }, index) => ({
    position: index + 1,
    title: song.title,
    composers: song.composers?.trim() ?? "",
    lyricists: song.lyricists?.trim() || "",
    publisher: song.publisher?.trim() ?? "",
    gemaWorkNumber: song.gemaWorkNumber?.trim() ?? "",
    durationSeconds: duration ?? null,
    incomplete: !song.composers?.trim(),
  }));

  const time = (value: Date) => value.toLocaleTimeString("de-DE", { timeZone, hour: "2-digit", minute: "2-digit" });
  return {
    bandName: event.band.name,
    event: {
      title: event.title,
      date: event.startsAt.toLocaleDateString("de-DE", { timeZone, weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }),
      start: time(event.startsAt),
      end: event.endsAt ? time(event.endsAt) : null,
      venue: event.venueLabel,
      promoter: event.contactName,
    },
    source: played.length > 0 ? "played" : "setlist",
    rows,
    totalSeconds: rows.reduce((sum, row) => sum + (row.durationSeconds ?? 0), 0),
  };
}

export function formatClock(seconds: number | null): string {
  if (!seconds) return "";
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Semicolon separated with BOM – opens correctly in German Excel and LibreOffice. */
export function gemaCsv(list: GemaList): string {
  const cell = (value: string | number) => {
    const text = String(value);
    return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [
    ["Nr.", "Titel", "Komponist", "Textdichter", "Verlag", "GEMA-Werknummer", "Dauer"],
    ...list.rows.map((row) => [row.position, row.title, row.composers, row.lyricists || row.composers, row.publisher, row.gemaWorkNumber, formatClock(row.durationSeconds)]),
  ];
  return "﻿" + lines.map((line) => line.map(cell).join(";")).join("\r\n") + "\r\n";
}

const MM = 2.8346;
const A4_LANDSCAPE: [number, number] = [297 * MM, 210 * MM];
const INK = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.42, 0.42, 0.47);
const LINE = rgb(0.86, 0.86, 0.89);
const WARN = rgb(0.75, 0.38, 0.05);

function fit(text: string, font: PDFFont, size: number, width: number): string {
  let value = toWinAnsi(text);
  if (font.widthOfTextAtSize(value, size) <= width) return value;
  while (value.length > 1 && font.widthOfTextAtSize(`${value}…`, size) > width) value = value.slice(0, -1);
  return `${value}…`;
}

export async function renderGemaPdf(list: GemaList): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(toWinAnsi(`Musikfolge ${list.bandName} – ${list.event.date}`));
  pdf.setCreator("Bandival");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const left = 15 * MM;
  const right = A4_LANDSCAPE[0] - 15 * MM;
  const text = (page: PDFPage, value: string, x: number, y: number, size = 9, face = font, color = INK) => page.drawText(toWinAnsi(value), { x, y, size, font: face, color });

  // Columns: Nr. | Titel | Komponist | Textdichter | Verlag | Werknummer | Dauer
  const columns = [
    { label: "Nr.", x: left, width: 10 * MM },
    { label: "Titel des Werkes", x: left + 10 * MM, width: 62 * MM },
    { label: "Komponist", x: left + 74 * MM, width: 48 * MM },
    { label: "Textdichter", x: left + 124 * MM, width: 46 * MM },
    { label: "Verlag", x: left + 172 * MM, width: 38 * MM },
    { label: "GEMA-Werknr.", x: left + 212 * MM, width: 32 * MM },
    { label: "Dauer", x: right - 12 * MM, width: 12 * MM },
  ];

  let page = pdf.addPage(A4_LANDSCAPE);
  let y = A4_LANDSCAPE[1] - 18 * MM;
  text(page, "Musikfolge – Live-Musik", left, y, 18, bold);
  text(page, list.bandName, right - bold.widthOfTextAtSize(toWinAnsi(list.bandName), 12), y + 2, 12, bold);
  y -= 22;

  const info: Array<[string, string]> = [
    ["Veranstaltung", list.event.title],
    ["Datum / Uhrzeit", `${list.event.date}, ${list.event.start}${list.event.end ? ` – ${list.event.end}` : ""} Uhr`],
    ["Veranstaltungsort", list.event.venue ?? ""],
    ["Veranstalter", list.event.promoter ?? ""],
    ["Interpret / Band", list.bandName],
    ["Titel / Gesamtdauer", `${list.rows.length} Titel · ${formatClock(list.totalSeconds) || "–"} min`],
  ];
  info.forEach(([label, value], index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = column === 0 ? left : left + 135 * MM;
    const lineY = y - row * 14;
    text(page, label, x, lineY, 8.5, font, MUTED);
    text(page, fit(value || "______________________", font, 10, 95 * MM), x + 34 * MM, lineY, 10);
  });
  y -= 3 * 14 + 10;

  const header = (target: PDFPage, top: number) => {
    target.drawRectangle({ x: left - 3, y: top - 5, width: right - left + 6, height: 18, color: rgb(0.95, 0.95, 0.96) });
    for (const column of columns) text(target, column.label, column.x, top, 8.5, bold, MUTED);
  };
  header(page, y);
  y -= 20;

  for (const row of list.rows) {
    if (y < 22 * MM) {
      page = pdf.addPage(A4_LANDSCAPE);
      y = A4_LANDSCAPE[1] - 18 * MM;
      header(page, y);
      y -= 20;
    }
    const values = [String(row.position), row.title, row.composers || "fehlt", row.lyricists || row.composers, row.publisher || "–", row.gemaWorkNumber, formatClock(row.durationSeconds)];
    values.forEach((value, index) => {
      const column = columns[index];
      const missing = index === 2 && row.incomplete;
      text(page, fit(value, font, 9.5, column.width - 4), column.x, y, 9.5, missing ? bold : font, missing ? WARN : INK);
    });
    page.drawLine({ start: { x: left, y: y - 5 }, end: { x: right, y: y - 5 }, thickness: 0.4, color: LINE });
    y -= 17;
  }

  const pages = pdf.getPages();
  pages.forEach((target, index) => {
    text(target, "Erstellt mit Bandival – Angaben bitte prüfen und im GEMA-Onlineportal (Musikfolgen) einreichen oder dem Veranstalter übergeben.", left, 10 * MM, 7, font, MUTED);
    if (pages.length > 1) {
      const label = `Seite ${index + 1} von ${pages.length}`;
      text(target, label, right - font.widthOfTextAtSize(label, 7), 10 * MM, 7, font, MUTED);
    }
  });
  return pdf.save();
}
