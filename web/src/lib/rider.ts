import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { z } from "zod";
import { toWinAnsi } from "@/lib/setlist-pdf";

/** Technical rider + stage plot of a band (stored as JSON on the band). */
export const STAGE_ITEM_KINDS = ["drums", "amp", "bass_amp", "keys", "mic", "monitor", "di", "person", "power", "riser", "other"] as const;

export const riderSchema = z.object({
  inputs: z.array(z.object({
    channel: z.number().int().min(1).max(128),
    source: z.string().trim().max(60),
    mic: z.string().trim().max(60).default(""),
    stand: z.string().trim().max(40).default(""),
    notes: z.string().trim().max(120).default(""),
  })).max(96).default([]),
  monitors: z.array(z.object({
    mix: z.number().int().min(1).max(32),
    who: z.string().trim().max(60),
    notes: z.string().trim().max(160).default(""),
  })).max(32).default([]),
  stagePlot: z.array(z.object({
    id: z.string().max(20),
    kind: z.enum(STAGE_ITEM_KINDS),
    label: z.string().trim().max(40),
    x: z.number().min(0).max(100),
    y: z.number().min(0).max(100),
  })).max(80).default([]),
  stageWidth: z.number().min(2).max(40).nullable().default(null),
  stageDepth: z.number().min(2).max(30).nullable().default(null),
  backline: z.string().max(3000).default(""),
  hospitality: z.string().max(3000).default(""),
  notes: z.string().max(3000).default(""),
});

export type Rider = z.infer<typeof riderSchema>;

export function parseRider(value: unknown): Rider {
  const result = riderSchema.safeParse(value ?? {});
  return result.success ? result.data : riderSchema.parse({});
}

const A4: [number, number] = [595.28, 841.89];
const INK = rgb(0.09, 0.09, 0.11);
const MUTED = rgb(0.45, 0.45, 0.5);
const LINE = rgb(0.85, 0.85, 0.88);
const ACCENT = rgb(0.05, 0.45, 0.56);

function text(page: PDFPage, value: string, x: number, y: number, font: PDFFont, size: number, color = INK, maxWidth?: number) {
  let output = toWinAnsi(value);
  if (maxWidth) {
    while (output.length > 1 && font.widthOfTextAtSize(output, size) > maxWidth) output = output.slice(0, -2) + "…";
  }
  page.drawText(output, { x, y, font, size, color });
}

function paragraph(page: PDFPage, value: string, x: number, y: number, font: PDFFont, size: number, maxWidth: number): number {
  let cursor = y;
  for (const raw of toWinAnsi(value).split("\n")) {
    let line = "";
    for (const word of raw.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
        page.drawText(line, { x, y: cursor, font, size, color: INK });
        cursor -= size * 1.35;
        line = word;
      } else {
        line = candidate;
      }
    }
    page.drawText(line, { x, y: cursor, font, size, color: INK });
    cursor -= size * 1.35;
  }
  return cursor;
}

export async function renderRiderPdf(input: {
  bandName: string;
  rider: Rider;
  event?: { title: string; date: string; venue: string | null; loadIn?: string | null; soundcheck?: string | null; doors?: string | null; contact?: string | null } | null;
  contactEmail?: string | null;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${input.bandName} – Technical Rider`);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const margin = 48;
  const width = A4[0] - margin * 2;

  /* ---------- Page 1: rider ---------- */
  let page = pdf.addPage(A4);
  let y = A4[1] - margin;
  text(page, "TECHNICAL RIDER", margin, y, bold, 10, ACCENT);
  y -= 26;
  text(page, input.bandName, margin, y, bold, 24);
  y -= 20;
  if (input.event) {
    const meta = [input.event.title, input.event.date, input.event.venue].filter(Boolean).join(" · ");
    text(page, meta, margin, y, font, 11, MUTED, width);
    y -= 15;
    const times = [
      input.event.loadIn ? `Load-in ${input.event.loadIn}` : null,
      input.event.soundcheck ? `Soundcheck ${input.event.soundcheck}` : null,
      input.event.doors ? `Doors ${input.event.doors}` : null,
    ].filter(Boolean).join("   ");
    if (times) {
      text(page, times, margin, y, bold, 10);
      y -= 15;
    }
  }
  if (input.contactEmail) {
    text(page, `Kontakt: ${input.contactEmail}`, margin, y, font, 10, MUTED);
    y -= 15;
  }
  y -= 10;

  const ensureSpace = (needed: number) => {
    if (y - needed < margin) {
      page = pdf.addPage(A4);
      y = A4[1] - margin;
    }
  };

  // Input list
  text(page, "Input List", margin, y, bold, 13);
  y -= 18;
  const columns = [{ label: "Ch", x: 0, w: 28 }, { label: "Source", x: 32, w: 150 }, { label: "Mic / DI", x: 186, w: 120 }, { label: "Stand", x: 310, w: 70 }, { label: "Notes", x: 384, w: width - 384 }];
  columns.forEach((column) => text(page, column.label, margin + column.x, y, bold, 9, MUTED));
  y -= 6;
  page.drawLine({ start: { x: margin, y }, end: { x: margin + width, y }, thickness: 0.7, color: LINE });
  y -= 13;
  const inputs = [...input.rider.inputs].sort((a, b) => a.channel - b.channel);
  if (inputs.length === 0) {
    text(page, "–", margin, y, font, 10, MUTED);
    y -= 14;
  }
  for (const row of inputs) {
    ensureSpace(16);
    const values = [String(row.channel), row.source, row.mic, row.stand, row.notes];
    columns.forEach((column, position) => text(page, values[position] ?? "", margin + column.x, y, position === 1 ? bold : font, 10, INK, column.w - 4));
    y -= 6;
    page.drawLine({ start: { x: margin, y }, end: { x: margin + width, y }, thickness: 0.4, color: LINE });
    y -= 12;
  }

  if (input.rider.monitors.length) {
    y -= 10;
    ensureSpace(40);
    text(page, "Monitoring", margin, y, bold, 13);
    y -= 18;
    for (const monitor of [...input.rider.monitors].sort((a, b) => a.mix - b.mix)) {
      ensureSpace(16);
      text(page, `Mix ${monitor.mix}`, margin, y, bold, 10);
      text(page, monitor.who, margin + 60, y, font, 10, INK, 150);
      text(page, monitor.notes, margin + 220, y, font, 10, MUTED, width - 220);
      y -= 15;
    }
  }

  for (const [title, body] of [["Backline", input.rider.backline], ["Hospitality", input.rider.hospitality], ["Notes", input.rider.notes]] as const) {
    if (!body.trim()) continue;
    y -= 10;
    ensureSpace(50);
    text(page, title, margin, y, bold, 13);
    y -= 17;
    y = paragraph(page, body, margin, y, font, 10, width);
  }

  /* ---------- Page 2: stage plot ---------- */
  if (input.rider.stagePlot.length) {
    const plot = pdf.addPage([A4[1], A4[0]]); // landscape
    const plotMargin = 40;
    text(plot, `${input.bandName} – Stage Plot`, plotMargin, A4[0] - plotMargin, bold, 18);
    const stageX = plotMargin;
    const stageY = plotMargin + 30;
    const stageW = A4[1] - plotMargin * 2;
    const stageH = A4[0] - plotMargin * 2 - 70;
    plot.drawRectangle({ x: stageX, y: stageY, width: stageW, height: stageH, borderColor: INK, borderWidth: 1.2 });
    text(plot, "PUBLIKUM / AUDIENCE", stageX + stageW / 2 - 60, stageY - 18, bold, 10, MUTED);
    if (input.rider.stageWidth && input.rider.stageDepth) {
      text(plot, `${input.rider.stageWidth} m × ${input.rider.stageDepth} m`, stageX + stageW - 90, stageY + stageH + 8, font, 9, MUTED);
    }
    for (const item of input.rider.stagePlot) {
      // y = 0 is the back of the stage, 100 the front edge.
      const cx = stageX + (item.x / 100) * stageW;
      const cy = stageY + stageH - (item.y / 100) * stageH;
      const size = item.kind === "drums" || item.kind === "riser" ? 46 : item.kind === "person" ? 18 : 30;
      if (item.kind === "person" || item.kind === "mic") {
        plot.drawCircle({ x: cx, y: cy, size: size / 2, borderColor: ACCENT, borderWidth: 1.2, color: rgb(0.9, 0.97, 0.98) });
      } else if (item.kind === "monitor") {
        plot.drawRectangle({ x: cx - 16, y: cy - 9, width: 32, height: 18, borderColor: INK, borderWidth: 1, color: rgb(0.95, 0.95, 0.96) });
      } else {
        plot.drawRectangle({ x: cx - size / 2, y: cy - size / 2, width: size, height: size, borderColor: INK, borderWidth: 1, color: rgb(0.96, 0.96, 0.97) });
      }
      const label = toWinAnsi(item.label);
      const labelWidth = font.widthOfTextAtSize(label, 8);
      plot.drawText(label, { x: cx - labelWidth / 2, y: cy - size / 2 - 11, font, size: 8, color: INK });
    }
  }

  return pdf.save();
}
