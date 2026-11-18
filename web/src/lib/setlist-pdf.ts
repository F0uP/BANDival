import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";

const WIN_ANSI_EXTRAS = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");

/** Standard PDF fonts only support WinAnsi – replace everything else so the export never crashes. */
export function toWinAnsi(value: string): string {
  return Array.from(value.normalize("NFC"))
    .map((char) => {
      const code = char.codePointAt(0) ?? 0;
      if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRAS.has(char)) {
        return char;
      }
      if (char === "\t") return " ";
      if (char === "♯") return "#";
      if (char === "♭") return "b";
      return "";
    })
    .join("");
}

function formatDuration(totalSeconds: number | null | undefined): string {
  if (!totalSeconds || totalSeconds <= 0) {
    return "–";
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function truncate(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) {
    return text;
  }
  let out = text;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}…`, size) > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}…`;
}

export type SetlistPdfInput = {
  bandName: string;
  name: string;
  description: string | null;
  eventLabel?: string | null;
  items: Array<{
    position: number;
    title: string;
    keySignature: string | null;
    tempoBpm: number | null;
    durationSeconds: number | null;
    transitionNotes: string | null;
  }>;
};

export async function renderSetlistPdf(input: SetlistPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(toWinAnsi(input.name));
  pdf.setCreator("Bandival");

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const oblique = await pdf.embedFont(StandardFonts.HelveticaOblique);

  const pageSize: [number, number] = [595.28, 841.89];
  const margin = 48;
  const ink = rgb(0.09, 0.09, 0.11);
  const muted = rgb(0.42, 0.42, 0.47);
  const accent = rgb(0.03, 0.57, 0.7);
  const line = rgb(0.89, 0.89, 0.91);

  let page = pdf.addPage(pageSize);
  let y = pageSize[1] - margin;
  const contentWidth = pageSize[0] - margin * 2;

  page.drawText(toWinAnsi(input.bandName.toUpperCase()), { x: margin, y, size: 10, font: bold, color: accent });
  y -= 30;
  page.drawText(truncate(toWinAnsi(input.name), bold, 26, contentWidth), { x: margin, y, size: 26, font: bold, color: ink });
  y -= 20;

  const totalSeconds = input.items.reduce((sum, item) => sum + (item.durationSeconds ?? 0), 0);
  const meta = [
    `${input.items.length} Songs`,
    `Gesamt ${formatDuration(totalSeconds)}`,
    input.eventLabel ? toWinAnsi(input.eventLabel) : null,
    `Stand ${new Date().toLocaleDateString("de-DE")}`,
  ].filter(Boolean).join("   ·   ");
  page.drawText(meta, { x: margin, y, size: 10, font: regular, color: muted });
  y -= 16;

  if (input.description) {
    for (const rawLine of toWinAnsi(input.description).split(/\r?\n/).slice(0, 4)) {
      page.drawText(truncate(rawLine, oblique, 10, contentWidth), { x: margin, y, size: 10, font: oblique, color: muted });
      y -= 14;
    }
  }

  y -= 10;
  page.drawLine({ start: { x: margin, y }, end: { x: pageSize[0] - margin, y }, thickness: 1, color: line });
  y -= 30;

  for (const item of input.items) {
    const needed = item.transitionNotes ? 54 : 40;
    if (y - needed < margin) {
      page = pdf.addPage(pageSize);
      y = pageSize[1] - margin - 10;
    }

    const number = String(item.position).padStart(2, " ");
    page.drawText(number, { x: margin, y, size: 20, font: bold, color: accent });

    const metaParts = [
      item.keySignature ? toWinAnsi(item.keySignature) : null,
      item.tempoBpm ? `${Math.round(item.tempoBpm)} BPM` : null,
      formatDuration(item.durationSeconds),
    ].filter(Boolean).join("  ·  ");
    const metaWidth = regular.widthOfTextAtSize(metaParts, 11);
    page.drawText(metaParts, { x: pageSize[0] - margin - metaWidth, y: y + 3, size: 11, font: regular, color: muted });

    const titleMax = contentWidth - 40 - metaWidth - 16;
    page.drawText(truncate(toWinAnsi(item.title), bold, 20, titleMax), { x: margin + 40, y, size: 20, font: bold, color: ink });
    y -= 18;

    if (item.transitionNotes) {
      page.drawText(truncate(`» ${toWinAnsi(item.transitionNotes)}`, oblique, 10, contentWidth - 40), {
        x: margin + 40,
        y,
        size: 10,
        font: oblique,
        color: muted,
      });
      y -= 14;
    }

    y -= 16;
  }

  return pdf.save();
}
