export type InvoiceStatus = "draft" | "issued" | "paid" | "cancelled";

export type Recipient = { name: string; company: string; street: string; zip: string; city: string; country: string; email: string; vatId: string };
export type InvoiceItem = { description: string; quantity: number; unit: string; unitPriceCents: number; vatRate: number };

export type InvoiceRow = {
  id: string;
  bandId: string;
  eventId: string | null;
  status: InvoiceStatus;
  number: string | null;
  issueDate: string | null;
  serviceDate: string | null;
  serviceDateTo: string | null;
  dueDate: string | null;
  recipient: Recipient;
  items: InvoiceItem[];
  intro: string | null;
  notes: string | null;
  netCents: number;
  vatCents: number;
  grossCents: number;
  smallBusiness: boolean;
  reverseCharge: boolean;
  cancelsNumber: string | null;
  paidAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  event: { id: string; title: string; startsAt?: string } | null;
};

export type InvoiceTotals = {
  lines: number[];
  netCents: number;
  vatGroups: Array<{ rate: number; baseCents: number; vatCents: number }>;
  vatCents: number;
  grossCents: number;
};

export type InvoiceDetail = {
  invoice: InvoiceRow;
  missing: string[];
  totals: InvoiceTotals;
  smallBusiness: boolean;
  paymentTermDays: number;
};

export type InvoiceSettings = {
  issuerName: string;
  issuerContact: string;
  street: string;
  zip: string;
  city: string;
  country: string;
  email: string;
  phone: string;
  website: string;
  taxNumber: string;
  vatId: string;
  smallBusiness: boolean;
  defaultVatRate: number;
  accountHolder: string;
  iban: string;
  bic: string;
  bankName: string;
  paymentTermDays: number;
  numberFormat: string;
  intro: string;
  footer: string;
  logoUrl: string | null;
  accentColor: string;
};

const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
export const money = (cents: number) => euro.format(cents / 100);

export function parseEuro(value: string): number | null {
  const normalized = value.trim().replace(/\s|€/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const number = Number(normalized);
  return normalized && Number.isFinite(number) ? Math.round(number * 100) : null;
}

export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function formatDay(value: string | null | undefined): string {
  if (!value) return "–";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}.${month}.${year}`;
}

export function recipientLabel(recipient: Recipient): string {
  return recipient.company || recipient.name || "Ohne Empfänger";
}

export function invoiceStatus(invoice: Pick<InvoiceRow, "status" | "cancelsNumber" | "dueDate">, todayKey: string): { label: string; tone: "neutral" | "accent" | "success" | "warning" | "danger" } {
  if (invoice.status === "draft") return { label: "Entwurf", tone: "neutral" };
  if (invoice.status === "paid") return { label: "Bezahlt", tone: "success" };
  if (invoice.status === "cancelled") return { label: "Storniert", tone: "neutral" };
  if (invoice.cancelsNumber) return { label: "Stornorechnung", tone: "accent" };
  if (invoice.dueDate && invoice.dueDate < todayKey) return { label: "Überfällig", tone: "danger" };
  return { label: "Offen", tone: "warning" };
}

/** Same arithmetic as the server (lib/invoice.ts computeTotals) for live totals while editing. */
export function clientTotals(items: InvoiceItem[], smallBusiness: boolean, reverseCharge: boolean): InvoiceTotals {
  const lines = items.map((item) => Math.round(item.quantity * item.unitPriceCents));
  const netCents = lines.reduce((sum, value) => sum + value, 0);
  const byRate = new Map<number, number>();
  if (!smallBusiness && !reverseCharge) items.forEach((item, index) => byRate.set(item.vatRate, (byRate.get(item.vatRate) ?? 0) + lines[index]));
  const vatGroups = Array.from(byRate, ([rate, base]) => ({ rate, baseCents: base, vatCents: Math.round((base * rate) / 100) }))
    .filter((group) => group.baseCents !== 0)
    .sort((a, b) => b.rate - a.rate);
  const vatCents = vatGroups.reduce((sum, group) => sum + group.vatCents, 0);
  return { lines, netCents, vatGroups, vatCents, grossCents: netCents + vatCents };
}

export function previewNumber(pattern: string, date: Date, sequence = 1): string {
  return pattern
    .replace(/\{YYYY\}/g, String(date.getFullYear()))
    .replace(/\{YY\}/g, String(date.getFullYear()).slice(-2))
    .replace(/\{MM\}/g, String(date.getMonth() + 1).padStart(2, "0"))
    .replace(/\{(N+)\}/g, (_, digits: string) => String(sequence).padStart(digits.length, "0"));
}

/** Issuer data required before the first invoice can be issued. */
export function issuerIncomplete(settings: InvoiceSettings | undefined): boolean {
  if (!settings) return false;
  return !settings.issuerName || !settings.street || !settings.zip || !settings.city || (!settings.taxNumber && !settings.vatId);
}
