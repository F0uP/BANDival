import { readFile } from "node:fs/promises";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import { z } from "zod";
import { toWinAnsi } from "@/lib/setlist-pdf";
import { resolveUploadPath } from "@/lib/storage";

/* ---------------- Settings (issuer data of the band) ---------------- */

export const invoiceSettingsSchema = z.object({
  issuerName: z.string().trim().max(120).default(""),
  issuerContact: z.string().trim().max(120).default(""),
  street: z.string().trim().max(120).default(""),
  zip: z.string().trim().max(16).default(""),
  city: z.string().trim().max(80).default(""),
  country: z.string().trim().max(60).default("Deutschland"),
  email: z.string().trim().max(200).default(""),
  phone: z.string().trim().max(60).default(""),
  website: z.string().trim().max(200).default(""),
  taxNumber: z.string().trim().max(40).default(""),
  vatId: z.string().trim().max(20).default(""),
  /** Kleinunternehmerregelung (§ 19 UStG): no VAT is charged. */
  smallBusiness: z.boolean().default(true),
  defaultVatRate: z.number().min(0).max(30).default(19),
  accountHolder: z.string().trim().max(120).default(""),
  iban: z.string().trim().max(40).default(""),
  bic: z.string().trim().max(16).default(""),
  bankName: z.string().trim().max(80).default(""),
  paymentTermDays: z.number().int().min(0).max(120).default(14),
  numberFormat: z.string().trim().max(40).default("RE-{YYYY}-{NNN}"),
  intro: z.string().max(1000).default("vielen Dank für die Zusammenarbeit. Für unseren Auftritt stellen wir folgende Leistungen in Rechnung:"),
  footer: z.string().max(500).default(""),
  logoUrl: z.string().max(300).nullable().default(null),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#0e7490"),
});

export type InvoiceSettings = z.infer<typeof invoiceSettingsSchema>;

export function parseInvoiceSettings(value: unknown, bandName = ""): InvoiceSettings {
  const parsed = invoiceSettingsSchema.safeParse(value ?? {});
  const settings = parsed.success ? parsed.data : invoiceSettingsSchema.parse({});
  return { ...settings, issuerName: settings.issuerName || bandName };
}

/* ---------------- Invoice data ---------------- */

export const recipientSchema = z.object({
  name: z.string().trim().max(120).default(""),
  company: z.string().trim().max(120).default(""),
  street: z.string().trim().max(120).default(""),
  zip: z.string().trim().max(16).default(""),
  city: z.string().trim().max(80).default(""),
  country: z.string().trim().max(60).default(""),
  email: z.string().trim().max(200).default(""),
  vatId: z.string().trim().max(20).default(""),
});

export const itemSchema = z.object({
  description: z.string().trim().min(1, "Jede Position braucht eine Beschreibung.").max(300),
  quantity: z.number().min(0).max(100000),
  unit: z.string().trim().max(20).default("Pauschal"),
  unitPriceCents: z.number().int().min(-100_000_000).max(100_000_000),
  vatRate: z.number().min(0).max(30).default(0),
});

export type InvoiceRecipient = z.infer<typeof recipientSchema>;
export type InvoiceItem = z.infer<typeof itemSchema>;

export function computeTotals(items: InvoiceItem[], smallBusiness: boolean, reverseCharge = false) {
  const lines = items.map((item) => Math.round(item.quantity * item.unitPriceCents));
  const netCents = lines.reduce((sum, value) => sum + value, 0);
  const byRate = new Map<number, number>();
  if (!smallBusiness && !reverseCharge) {
    items.forEach((item, index) => byRate.set(item.vatRate, (byRate.get(item.vatRate) ?? 0) + lines[index]));
  }
  // Net amounts per tax rate (§ 14 Abs. 4 Nr. 7 UStG) – zero-rated lines are listed as well.
  const vatGroups = Array.from(byRate, ([rate, base]) => ({ rate, baseCents: base, vatCents: Math.round((base * rate) / 100) }))
    .filter((group) => group.baseCents !== 0)
    .sort((a, b) => b.rate - a.rate);
  const vatCents = vatGroups.reduce((sum, group) => sum + group.vatCents, 0);
  return { lines, netCents, vatGroups, vatCents, grossCents: netCents + vatCents };
}

/** Formats the invoice number from the pattern ({YYYY}, {YY}, {MM}, {N…} = zero-padded sequence). */
export function formatInvoiceNumber(pattern: string, year: number, month: number, sequence: number): string {
  return (pattern || "RE-{YYYY}-{NNN}")
    .replace(/\{YYYY\}/g, String(year))
    .replace(/\{YY\}/g, String(year).slice(-2))
    .replace(/\{MM\}/g, String(month).padStart(2, "0"))
    .replace(/\{(N+)\}/g, (_, digits: string) => String(sequence).padStart(digits.length, "0"));
}

/**
 * Mandatory information according to § 14 Abs. 4 UStG – an invoice can only be issued when nothing is missing.
 * Returns human-readable German labels of the missing fields.
 */
export function missingMandatoryFields(input: {
  issuer: InvoiceSettings;
  recipient: InvoiceRecipient;
  items: InvoiceItem[];
  serviceDate: Date | null;
  smallBusiness: boolean;
  reverseCharge: boolean;
  notes?: string | null;
}): string[] {
  const missing: string[] = [];
  const { issuer, recipient } = input;
  if (!issuer.issuerName) missing.push("Name des Rechnungsstellers");
  if (!issuer.street || !issuer.zip || !issuer.city) missing.push("Vollständige Anschrift des Rechnungsstellers");
  if (!issuer.taxNumber && !issuer.vatId) missing.push("Steuernummer oder USt-IdNr. des Rechnungsstellers");
  if (!recipient.name && !recipient.company) missing.push("Name bzw. Firma des Empfängers");
  if (!recipient.street || !recipient.zip || !recipient.city) missing.push("Vollständige Anschrift des Empfängers");
  if (input.items.length === 0) missing.push("Mindestens eine Position (Menge und Art der Leistung)");
  if (!input.serviceDate) missing.push("Leistungsdatum bzw. Leistungszeitraum");
  if (input.reverseCharge && !recipient.vatId) missing.push("USt-IdNr. des Empfängers (für Reverse Charge)");
  if (input.reverseCharge && !issuer.vatId) missing.push("Eigene USt-IdNr. (für Reverse Charge)");
  if (!input.smallBusiness && !input.reverseCharge && input.items.some((item) => item.vatRate === 0) && !input.notes?.trim()) {
    missing.push("Hinweis auf die Steuerbefreiung der 0-%-Positionen (unter „Hinweise“)");
  }
  return missing;
}

/* ---------------- PDF ---------------- */

const MM = 2.8346; // points per millimetre
const A4: [number, number] = [210 * MM, 297 * MM];
const INK = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.42, 0.42, 0.47);
const LINE = rgb(0.86, 0.86, 0.89);
const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const money = (cents: number) => euro.format(cents / 100);
const dateDe = (value: Date | string | null | undefined) => (value ? new Date(value).toLocaleDateString("de-DE", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" }) : "");

function hexToRgb(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16);
  return rgb(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255);
}

function draw(page: PDFPage, value: string, x: number, y: number, font: PDFFont, size: number, color = INK, align: "left" | "right" = "left") {
  const text = toWinAnsi(value);
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: align === "right" ? x - width : x, y, font, size, color });
}

function wrap(value: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of toWinAnsi(value).split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** EPC QR code ("GiroCode") – banking apps fill in the transfer automatically. */
export function giroCodePayload(args: { name: string; iban: string; bic: string; amountCents: number; reference: string }): string | null {
  const iban = args.iban.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban) || args.amountCents <= 0) return null;
  return ["BCD", "002", "1", "SCT", args.bic.replace(/\s+/g, "").toUpperCase(), args.name.slice(0, 70), iban, `EUR${(args.amountCents / 100).toFixed(2)}`, "", "", args.reference.slice(0, 140), ""].join("\n");
}

async function embedLogo(pdf: PDFDocument, logoUrl: string | null): Promise<PDFImage | null> {
  if (!logoUrl) return null;
  const file = resolveUploadPath(logoUrl);
  if (!file) return null;
  try {
    const bytes = await readFile(file);
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return await pdf.embedPng(bytes);
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return await pdf.embedJpg(bytes);
  } catch {
    // missing file – render without logo
  }
  return null;
}

export type InvoicePdfInput = {
  number: string | null;
  status: string;
  issueDate: Date | null;
  serviceDate: Date | null;
  serviceDateTo: Date | null;
  dueDate: Date | null;
  recipient: InvoiceRecipient;
  items: InvoiceItem[];
  intro: string | null;
  notes: string | null;
  smallBusiness: boolean;
  reverseCharge: boolean;
  cancelsNumber: string | null;
  issuer: InvoiceSettings;
};

export async function renderInvoicePdf(input: InvoicePdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const issuer = input.issuer;
  pdf.setTitle(`Rechnung ${input.number ?? "(Entwurf)"} – ${issuer.issuerName}`);
  pdf.setAuthor(issuer.issuerName);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const accent = hexToRgb(issuer.accentColor);
  const logo = await embedLogo(pdf, issuer.logoUrl);
  const left = 25 * MM;
  const right = A4[0] - 20 * MM;
  const width = right - left;
  let page = pdf.addPage(A4);
  const totals = computeTotals(input.items, input.smallBusiness, input.reverseCharge);
  const noVat = input.smallBusiness || input.reverseCharge;
  const title = input.cancelsNumber ? "Stornorechnung" : input.status === "cancelled" ? "Rechnung (storniert)" : "Rechnung";

  const drawFooter = (target: PDFPage) => {
    const top = 26 * MM;
    target.drawLine({ start: { x: left, y: top }, end: { x: right, y: top }, thickness: 0.6, color: LINE });
    const columns = [
      [issuer.issuerName, issuer.issuerContact, issuer.street, [issuer.zip, issuer.city].filter(Boolean).join(" ")],
      [issuer.phone ? `Tel. ${issuer.phone}` : "", issuer.email, issuer.website, issuer.taxNumber ? `Steuernr. ${issuer.taxNumber}` : "", issuer.vatId ? `USt-IdNr. ${issuer.vatId}` : ""],
      [issuer.bankName, issuer.accountHolder ? `Inhaber: ${issuer.accountHolder}` : "", issuer.iban ? `IBAN ${issuer.iban}` : "", issuer.bic ? `BIC ${issuer.bic}` : ""],
    ].map((column) => column.filter(Boolean));
    const columnWidth = width / 3;
    columns.forEach((column, index) => {
      column.slice(0, 5).forEach((line, row) => draw(target, line, left + index * columnWidth, top - 10 - row * 9, font, 7, MUTED));
    });
  };

  /* Header: logo + issuer */
  const headerTop = A4[1] - 18 * MM;
  if (logo) {
    const scale = Math.min((22 * MM) / logo.height, (55 * MM) / logo.width);
    page.drawImage(logo, { x: left, y: headerTop - logo.height * scale, width: logo.width * scale, height: logo.height * scale });
  } else {
    draw(page, issuer.issuerName, left, headerTop - 16, bold, 18, accent);
  }
  const issuerLines = [issuer.issuerName, issuer.issuerContact, issuer.street, [issuer.zip, issuer.city].filter(Boolean).join(" "), issuer.email, issuer.phone].filter(Boolean);
  issuerLines.forEach((line, index) => draw(page, line, right, headerTop - 6 - index * 11, index === 0 ? bold : font, index === 0 ? 10 : 9, index === 0 ? INK : MUTED, "right"));

  /* DIN 5008 (form B) address field: 45 mm from top, sender line above */
  const addressTop = A4[1] - 45 * MM;
  const senderLine = [issuer.issuerName, issuer.street, [issuer.zip, issuer.city].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
  draw(page, senderLine, left, addressTop + 2, font, 7, MUTED);
  page.drawLine({ start: { x: left, y: addressTop - 1 }, end: { x: left + 85 * MM, y: addressTop - 1 }, thickness: 0.4, color: LINE });
  const recipient = input.recipient;
  const recipientLines = [recipient.company, recipient.name, recipient.street, [recipient.zip, recipient.city].filter(Boolean).join(" "), recipient.country && recipient.country !== "Deutschland" ? recipient.country : ""].filter(Boolean);
  recipientLines.forEach((line, index) => draw(page, line, left, addressTop - 16 - index * 13, index === 0 ? bold : font, 10.5));

  /* Info block (right) */
  const infoRows: Array<[string, string]> = [
    ["Rechnungsnummer", input.number ?? "Entwurf"],
    ["Rechnungsdatum", dateDe(input.issueDate ?? new Date())],
    ["Leistungsdatum", input.serviceDateTo ? `${dateDe(input.serviceDate)} – ${dateDe(input.serviceDateTo)}` : dateDe(input.serviceDate)],
    ["Fällig am", dateDe(input.dueDate)],
    ...(recipient.vatId ? [["USt-IdNr. Kunde", recipient.vatId] as [string, string]] : []),
  ];
  infoRows.filter(([, value]) => value).forEach(([label, value], index) => {
    const y = addressTop - 16 - index * 14;
    draw(page, label, right - 40 * MM, y, font, 8.5, MUTED, "right");
    draw(page, value, right, y, label === "Rechnungsnummer" ? bold : font, 9.5, INK, "right");
  });

  /* Title */
  let y = A4[1] - 103 * MM;
  draw(page, title, left, y, bold, 20, INK);
  if (input.number) draw(page, `Nr. ${input.number}`, left + bold.widthOfTextAtSize(title, 20) + 10, y + 1, font, 12, MUTED);
  page.drawRectangle({ x: left, y: y - 9, width: 28, height: 3, color: accent });
  y -= 30;
  const greeting = recipient.name ? `Hallo ${recipient.name.split(" ")[0]},` : "Sehr geehrte Damen und Herren,";
  draw(page, greeting, left, y, font, 10);
  y -= 15;
  const introText = input.cancelsNumber
    ? `hiermit stornieren wir unsere Rechnung Nr. ${input.cancelsNumber} vollständig. Die Beträge werden mit umgekehrtem Vorzeichen ausgewiesen.`
    : input.intro || issuer.intro;
  for (const line of wrap(introText, font, 10, width)) {
    draw(page, line, left, y, font, 10);
    y -= 14;
  }
  y -= 10;

  /* Items table */
  const columns = { pos: left, description: left + 10 * MM, quantity: right - 78 * MM, price: right - 40 * MM, vat: right - 26 * MM, total: right };
  const header = (target: PDFPage, top: number) => {
    target.drawRectangle({ x: left - 4, y: top - 6, width: width + 8, height: 20, color: rgb(0.96, 0.96, 0.97) });
    draw(target, "Pos.", columns.pos, top, bold, 8.5, MUTED);
    draw(target, "Beschreibung", columns.description, top, bold, 8.5, MUTED);
    draw(target, "Menge", columns.quantity, top, bold, 8.5, MUTED, "right");
    draw(target, "Einzelpreis", columns.price, top, bold, 8.5, MUTED, "right");
    if (!noVat) draw(target, "USt.", columns.vat, top, bold, 8.5, MUTED, "right");
    draw(target, "Betrag", columns.total, top, bold, 8.5, MUTED, "right");
  };
  header(page, y);
  y -= 24;
  input.items.forEach((item, index) => {
    const descriptionLines = wrap(item.description, font, 10, columns.quantity - columns.description - 22 * MM);
    const needed = descriptionLines.length * 13 + 12;
    if (y - needed < 75 * MM) {
      drawFooter(page);
      page = pdf.addPage(A4);
      y = A4[1] - 25 * MM;
      header(page, y);
      y -= 24;
    }
    draw(page, String(index + 1), columns.pos, y, font, 10, MUTED);
    descriptionLines.forEach((line, row) => draw(page, line, columns.description, y - row * 13, row === 0 ? font : font, 10));
    const quantity = Number.isInteger(item.quantity) ? String(item.quantity) : item.quantity.toLocaleString("de-DE");
    draw(page, `${quantity} ${item.unit}`.trim(), columns.quantity, y, font, 10, INK, "right");
    draw(page, money(item.unitPriceCents), columns.price, y, font, 10, INK, "right");
    if (!noVat) draw(page, `${item.vatRate.toLocaleString("de-DE")} %`, columns.vat, y, font, 10, MUTED, "right");
    draw(page, money(totals.lines[index]), columns.total, y, font, 10, INK, "right");
    y -= descriptionLines.length * 13 + 6;
    page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.4, color: LINE });
    y -= 14;
  });

  /* Totals */
  if (y < 95 * MM) {
    drawFooter(page);
    page = pdf.addPage(A4);
    y = A4[1] - 30 * MM;
  }
  const labelX = right - 62 * MM;
  const totalRow = (label: string, value: string, strong = false) => {
    draw(page, label, labelX, y, strong ? bold : font, strong ? 11 : 10, strong ? INK : MUTED);
    draw(page, value, right, y, strong ? bold : font, strong ? 11 : 10, INK, "right");
    y -= strong ? 18 : 15;
  };
  if (totals.vatGroups.length > 1) {
    for (const group of totals.vatGroups) totalRow(`Netto zu ${group.rate.toLocaleString("de-DE")} %`, money(group.baseCents));
  } else {
    totalRow("Nettobetrag", money(totals.netCents));
  }
  for (const group of totals.vatGroups) totalRow(`zzgl. ${group.rate.toLocaleString("de-DE")} % USt.`, money(group.vatCents));
  page.drawLine({ start: { x: labelX, y: y + 8 }, end: { x: right, y: y + 8 }, thickness: 0.8, color: INK });
  y -= 4;
  totalRow(noVat ? "Rechnungsbetrag" : "Gesamtbetrag (brutto)", money(totals.grossCents), true);
  y -= 6;
  const taxNote = input.reverseCharge
    ? `Steuerschuldnerschaft des Leistungsempfängers (Reverse Charge, § 13b UStG / Art. 196 MwStSystRL). USt-IdNr. Leistender: ${issuer.vatId} · USt-IdNr. Leistungsempfänger: ${recipient.vatId}.`
    : input.smallBusiness
      ? "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung)."
      : null;
  if (taxNote) {
    for (const line of wrap(taxNote, font, 9, width)) {
      draw(page, line, left, y, font, 9, MUTED);
      y -= 12;
    }
  }

  /* Payment */
  y -= 10;
  const payment = input.cancelsNumber
    ? "Bereits gezahlte Beträge erstatten wir auf das uns bekannte Konto."
    : input.status === "paid"
    ? "Der Rechnungsbetrag wurde bereits beglichen – vielen Dank!"
    : `Bitte überweise den Betrag${input.dueDate ? ` bis zum ${dateDe(input.dueDate)}` : ""} unter Angabe der Rechnungsnummer${issuer.iban ? ` auf folgendes Konto: ${issuer.accountHolder || issuer.issuerName}, IBAN ${issuer.iban}${issuer.bic ? `, BIC ${issuer.bic}` : ""}${issuer.bankName ? ` (${issuer.bankName})` : ""}.` : "."}`;
  const qrPayload = input.status !== "paid" && input.status !== "cancelled" && !input.cancelsNumber
    ? giroCodePayload({ name: issuer.accountHolder || issuer.issuerName, iban: issuer.iban, bic: issuer.bic, amountCents: totals.grossCents, reference: input.number ? `Rechnung ${input.number}` : "Rechnung" })
    : null;
  const textWidth = qrPayload ? width - 34 * MM : width;
  const paymentTop = y;
  for (const line of wrap(payment, font, 10, textWidth)) {
    draw(page, line, left, y, font, 10);
    y -= 14;
  }
  if (input.notes) {
    y -= 6;
    for (const line of wrap(input.notes, font, 9.5, textWidth)) {
      draw(page, line, left, y, font, 9.5, MUTED);
      y -= 13;
    }
  }
  if (issuer.footer) {
    y -= 6;
    for (const line of wrap(issuer.footer, font, 9.5, textWidth)) {
      draw(page, line, left, y, font, 9.5, MUTED);
      y -= 13;
    }
  }
  if (qrPayload) {
    const png = await QRCode.toBuffer(qrPayload, { type: "png", errorCorrectionLevel: "M", margin: 1, width: 300 });
    const image = await pdf.embedPng(png);
    const size = 28 * MM;
    page.drawImage(image, { x: right - size, y: paymentTop - size + 10, width: size, height: size });
    draw(page, "GiroCode – mit der Banking-App scannen", right - size / 2 - font.widthOfTextAtSize("GiroCode – mit der Banking-App scannen", 6.5) / 2, paymentTop - size + 2, font, 6.5, MUTED);
  }

  if (input.status === "draft" || input.status === "cancelled") {
    const label = input.status === "draft" ? "ENTWURF" : "STORNIERT";
    for (const target of pdf.getPages()) {
      target.drawText(label, { x: 60 * MM, y: 120 * MM, size: 72, font: bold, color: rgb(0.85, 0.2, 0.2), opacity: 0.12, rotate: { type: "degrees" as never, angle: 35 } as never });
    }
  }
  pdf.getPages().forEach((target, index, all) => {
    drawFooter(target);
    if (all.length > 1) draw(target, `Seite ${index + 1} von ${all.length}`, right, 12 * MM, font, 7, MUTED, "right");
  });
  return pdf.save();
}
