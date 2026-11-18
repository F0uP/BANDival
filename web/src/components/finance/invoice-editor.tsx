"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  ArrowLeft, Ban, CalendarDays, Check, CircleAlert, Copy, Download, ExternalLink, FileText, Mail, Plus, Send, Settings2, Trash2, Wallet,
} from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import { cn } from "@/lib/client/cn";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Skeleton } from "@/components/ui/display";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/form";
import { useConfirm, useToast } from "@/components/ui/feedback";
import { useSession } from "@/components/providers/session";
import { InvoiceSettingsDialog } from "@/components/finance/invoice-settings-dialog";
import {
  centsToInput, clientTotals, formatDay, invoiceStatus, money, parseEuro, recipientLabel,
  type InvoiceDetail, type InvoiceItem, type InvoiceTotals, type Recipient,
} from "@/components/finance/invoice-shared";

type Row = { key: number; description: string; quantity: string; unit: string; price: string; vatRate: number };
type SaveState = "saved" | "dirty" | "saving" | "error";

const UNITS = ["Pauschal", "Std.", "Stk.", "Tag(e)", "km"];

function toRows(items: InvoiceItem[]): Row[] {
  return items.map((item, index) => ({
    key: index + 1,
    description: item.description,
    quantity: String(item.quantity).replace(".", ","),
    unit: item.unit,
    price: centsToInput(item.unitPriceCents),
    vatRate: item.vatRate,
  }));
}

function parseQuantity(value: string): number {
  const number = Number(value.replace(",", "."));
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function rowsToItems(rows: Row[]): InvoiceItem[] {
  return rows
    .filter((row) => row.description.trim())
    .map((row) => ({
      description: row.description.trim(),
      quantity: parseQuantity(row.quantity),
      unit: row.unit.trim() || "Pauschal",
      unitPriceCents: parseEuro(row.price) ?? 0,
      vatRate: row.vatRate,
    }));
}

/** Mandatory contents of an invoice (§ 14 Abs. 4 UStG) – the labels match the server check. */
function Checklist({ missing, smallBusiness, reverseCharge }: { missing: string[]; smallBusiness: boolean; reverseCharge: boolean }) {
  const checks = [
    "Name des Rechnungsstellers",
    "Vollständige Anschrift des Rechnungsstellers",
    "Steuernummer oder USt-IdNr. des Rechnungsstellers",
    "Name bzw. Firma des Empfängers",
    "Vollständige Anschrift des Empfängers",
    "Mindestens eine Position (Menge und Art der Leistung)",
    "Leistungsdatum bzw. Leistungszeitraum",
    ...(reverseCharge ? ["USt-IdNr. des Empfängers (für Reverse Charge)", "Eigene USt-IdNr. (für Reverse Charge)"] : []),
  ];
  const extra = missing.filter((label) => !checks.includes(label));
  const automatic = [
    "Rechnungsdatum & fortlaufende Rechnungsnummer (beim Stellen)",
    smallBusiness ? "Hinweis auf Kleinunternehmerregelung (§ 19 UStG)" : reverseCharge ? "Hinweis „Steuerschuldnerschaft des Leistungsempfängers“" : "Entgelt nach Steuersätzen, Steuersatz & Steuerbetrag",
    "Fälligkeit, Bankverbindung & GiroCode",
  ];
  return (
    <Card>
      <CardHeader
        title="Pflichtangaben"
        description="§ 14 Abs. 4 UStG – erst wenn alles grün ist, kann die Rechnung gestellt werden."
        icon={missing.length ? <CircleAlert className="text-warning" /> : <Check className="text-success" />}
      />
      <ul className="space-y-1.5 text-sm">
        {[...checks, ...extra].map((label) => {
          const ok = !missing.includes(label);
          return (
            <li key={label} className="flex items-start gap-2">
              {ok ? <Check className="mt-0.5 size-4 shrink-0 text-success" /> : <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" />}
              <span className={ok ? "text-muted" : "font-medium"}>{label}</span>
            </li>
          );
        })}
        {automatic.map((label) => (
          <li key={label} className="flex items-start gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-success" />
            <span className="text-muted">{label} <span className="text-subtle">· automatisch</span></span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Totals({ totals, smallBusiness, reverseCharge }: { totals: InvoiceTotals; smallBusiness: boolean; reverseCharge: boolean }) {
  const noVat = smallBusiness || reverseCharge;
  return (
    <dl className="ml-auto w-full max-w-xs space-y-1 text-sm">
      {totals.vatGroups.length > 1 ? totals.vatGroups.map((group) => (
        <div key={`net-${group.rate}`} className="flex justify-between gap-4"><dt className="text-muted">Netto zu {group.rate} %</dt><dd className="tabular-nums">{money(group.baseCents)}</dd></div>
      )) : <div className="flex justify-between gap-4"><dt className="text-muted">Nettobetrag</dt><dd className="tabular-nums">{money(totals.netCents)}</dd></div>}
      {totals.vatGroups.map((group) => (
        <div key={`vat-${group.rate}`} className="flex justify-between gap-4"><dt className="text-muted">zzgl. {group.rate} % USt.</dt><dd className="tabular-nums">{money(group.vatCents)}</dd></div>
      ))}
      <div className="flex justify-between gap-4 border-t border-border pt-1.5 text-base font-semibold">
        <dt>{noVat ? "Rechnungsbetrag" : "Gesamt (brutto)"}</dt>
        <dd className="tabular-nums">{money(totals.grossCents)}</dd>
      </div>
      {smallBusiness ? <p className="pt-1 text-xs text-muted">Keine USt. gemäß § 19 UStG (Kleinunternehmer).</p> : null}
      {reverseCharge && !smallBusiness ? <p className="pt-1 text-xs text-muted">Steuerschuldnerschaft des Leistungsempfängers (Reverse Charge).</p> : null}
    </dl>
  );
}

function Preview({ invoiceId, version }: { invoiceId: string; version: number }) {
  return (
    <Card padded={false} className="hidden overflow-hidden xl:block">
      <div className="flex items-center justify-between border-b border-border px-4 py-2 text-xs text-muted">
        <span>Vorschau</span>
        <a href={`/api/invoices/${invoiceId}/pdf`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-fg">In neuem Tab <ExternalLink className="size-3" /></a>
      </div>
      <iframe key={version} title="Rechnungsvorschau" src={`/api/invoices/${invoiceId}/pdf?v=${version}#toolbar=0&navpanes=0&view=FitH`} className="h-[780px] w-full bg-surface-2" />
    </Card>
  );
}

function DraftEditor({ detail, refresh }: { detail: InvoiceDetail; refresh: () => Promise<InvoiceDetail | undefined> }) {
  const invoice = detail.invoice;
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const { bandId } = useSession();
  const [recipient, setRecipient] = useState<Recipient>(invoice.recipient);
  const [rows, setRows] = useState<Row[]>(() => (invoice.items.length ? toRows(invoice.items) : [{ key: 1, description: "", quantity: "1", unit: "Pauschal", price: "", vatRate: detail.smallBusiness ? 0 : 19 }]));
  const [serviceDate, setServiceDate] = useState(invoice.serviceDate ?? "");
  const [serviceDateTo, setServiceDateTo] = useState(invoice.serviceDateTo ?? "");
  const [dueDate, setDueDate] = useState(invoice.dueDate ?? "");
  const [intro, setIntro] = useState(invoice.intro ?? "");
  const [notes, setNotes] = useState(invoice.notes ?? "");
  const [reverseCharge, setReverseCharge] = useState(invoice.reverseCharge);
  const [version, setVersion] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [previewVersion, setPreviewVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const nextKey = useRef(rows.length + 1);

  const items = useMemo(() => rowsToItems(rows), [rows]);
  const payload = useMemo(() => ({
    recipient,
    items,
    serviceDate: serviceDate || null,
    serviceDateTo: serviceDateTo || null,
    dueDate: dueDate || null,
    intro: intro.trim() || null,
    notes: notes.trim() || null,
    reverseCharge,
  }), [recipient, items, serviceDate, serviceDateTo, dueDate, intro, notes, reverseCharge]);
  const payloadRef = useRef(payload);
  useEffect(() => {
    payloadRef.current = payload;
  }, [payload]);

  const totals = clientTotals(items, detail.smallBusiness, reverseCharge);
  const noVat = detail.smallBusiness || reverseCharge;

  const touch = () => {
    setVersion((value) => value + 1);
    setSaveState("dirty");
  };

  const save = useCallback(async () => {
    setSaveState("saving");
    try {
      await api.patch(`/api/invoices/${invoice.id}`, payloadRef.current);
      setSaveState("saved");
      setPreviewVersion((value) => value + 1);
      return await refresh();
    } catch (error) {
      setSaveState("error");
      toast.error(errorMessage(error));
      return null;
    }
  }, [invoice.id, refresh, toast]);

  useEffect(() => {
    if (version === 0) return;
    const timer = window.setTimeout(() => void save(), 900);
    return () => window.clearTimeout(timer);
  }, [version, save]);

  const setRecipientField = (key: keyof Recipient, value: string) => {
    setRecipient((current) => ({ ...current, [key]: value }));
    touch();
  };
  const updateRow = (key: number, patch: Partial<Row>) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
    touch();
  };
  const addRow = () => {
    const key = nextKey.current;
    nextKey.current += 1;
    setRows((current) => [...current, { key, description: "", quantity: "1", unit: "Pauschal", price: "", vatRate: current.at(-1)?.vatRate ?? (detail.smallBusiness ? 0 : 19) }]);
    touch();
  };
  const removeRow = (key: number) => {
    setRows((current) => current.filter((row) => row.key !== key));
    touch();
  };

  const preview = async () => {
    const tab = window.open("about:blank", "_blank");
    await save();
    if (tab) tab.location.href = `/api/invoices/${invoice.id}/pdf`;
  };

  const issue = async () => {
    const fresh = await save();
    if (!fresh) return;
    if (fresh.missing.length) {
      toast.error(`Es fehlt noch: ${fresh.missing.join(", ")}.`);
      return;
    }
    const ok = await confirm({
      title: "Rechnung jetzt stellen?",
      description: "Die Rechnung bekommt die nächste fortlaufende Rechnungsnummer und das heutige Rechnungsdatum. Danach kann sie nicht mehr geändert oder gelöscht werden – Korrekturen nur per Stornorechnung.",
      confirmLabel: "Rechnung stellen",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.post(`/api/invoices/${invoice.id}/issue`);
      toast.success("Rechnung gestellt – PDF ist bereit.");
      await refresh();
    } catch (error) {
      toast.error(errorMessage(error));
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = await confirm({ title: "Entwurf löschen?", confirmLabel: "Löschen", tone: "danger" });
    if (!ok) return;
    try {
      await api.delete(`/api/invoices/${invoice.id}`);
      router.push("/app/finance/invoices");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const recipientInput = (key: keyof Recipient, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) =>
    function renderRecipientInput(id: string) {
      return <Input id={id} value={recipient[key]} onChange={(event) => setRecipientField(key, event.target.value)} {...extra} />;
    };

  return (
    <>
      <PageHeader
        back={<Link href="/app/finance/invoices" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ArrowLeft className="size-4" />Rechnungen</Link>}
        title="Rechnungsentwurf"
        description={(
          <span className="inline-flex flex-wrap items-center gap-2">
            {invoice.event ? <Link href={`/app/events/${invoice.event.id}`} className="inline-flex items-center gap-1 hover:underline"><CalendarDays className="size-3.5" />{invoice.event.title}</Link> : null}
            <span className={cn("text-xs", saveState === "error" ? "text-danger" : "text-subtle")}>
              {saveState === "saving" ? "Speichert …" : saveState === "dirty" ? "Ungespeicherte Änderungen" : saveState === "error" ? "Nicht gespeichert" : "Automatisch gespeichert"}
            </span>
          </span>
        )}
        actions={(
          <>
            <Button variant="ghost" icon={<Trash2 />} onClick={() => void remove()} aria-label="Entwurf löschen" />
            <Button icon={<Settings2 />} onClick={() => setSettingsOpen(true)}><span className="hidden sm:inline">Rechnungsdaten</span></Button>
            <Button icon={<FileText />} onClick={() => void preview()}>Vorschau</Button>
            <Button variant="primary" icon={<Send />} loading={busy} onClick={() => void issue()}>Rechnung stellen</Button>
          </>
        )}
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,34rem)]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Empfänger" description="Veranstalter, Club oder Agentur – vollständige Anschrift ist Pflicht." />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Firma / Veranstalter">{recipientInput("company", { placeholder: "z. B. Kulturzentrum Musterstadt e. V." })}</Field>
              <Field label="Name (Ansprechpartner:in)">{recipientInput("name")}</Field>
              <Field label="Straße und Hausnummer" className="sm:col-span-2">{recipientInput("street")}</Field>
              <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 sm:col-span-2 sm:grid-cols-[7rem_minmax(0,1fr)_minmax(0,1fr)]">
                <Field label="PLZ">{recipientInput("zip")}</Field>
                <Field label="Ort">{recipientInput("city")}</Field>
                <Field label="Land" optional className="col-span-2 sm:col-span-1">{recipientInput("country", { placeholder: "Deutschland" })}</Field>
              </div>
              <Field label="E-Mail" optional>{recipientInput("email", { type: "email" })}</Field>
              <Field label="USt-IdNr. des Empfängers" optional hint="Pflicht bei Reverse Charge (EU-Ausland)">{recipientInput("vatId")}</Field>
            </div>
          </Card>

          <Card>
            <CardHeader title="Leistung & Zahlung" />
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Leistungsdatum">{(id) => <Input id={id} type="date" value={serviceDate} onChange={(event) => { setServiceDate(event.target.value); touch(); }} />}</Field>
              <Field label="bis" optional hint="nur bei Zeitraum">{(id) => <Input id={id} type="date" value={serviceDateTo} min={serviceDate || undefined} onChange={(event) => { setServiceDateTo(event.target.value); touch(); }} />}</Field>
              <Field label="Fällig am" optional hint={`leer = ${detail.paymentTermDays} Tage nach Rechnungsdatum`}>{(id) => <Input id={id} type="date" value={dueDate} onChange={(event) => { setDueDate(event.target.value); touch(); }} />}</Field>
            </div>
            <div className="mt-4">
              <Switch
                checked={reverseCharge}
                onChange={(value) => { setReverseCharge(value); touch(); }}
                label="Reverse Charge (Auftraggeber im EU-Ausland)"
                description="Steuerschuld geht auf den Empfänger über – keine deutsche USt., Hinweis und beide USt-IdNr. werden gedruckt."
              />
            </div>
          </Card>

          <Card>
            <CardHeader title="Positionen" description="Menge und Art der Leistung – z. B. Gage, Fahrtkosten, Backline-Miete." />
            <div className="space-y-3">
              {rows.map((row, index) => {
                const line = Math.round(parseQuantity(row.quantity) * (parseEuro(row.price) ?? 0));
                return (
                  <div key={row.key} className="rounded-xl border border-border bg-surface-2/40 p-3">
                    <div className="flex items-start gap-2">
                      <span className="mt-2.5 w-5 shrink-0 text-xs tabular-nums text-subtle">{index + 1}.</span>
                      <Textarea
                        aria-label={`Position ${index + 1} – Beschreibung`}
                        rows={1}
                        value={row.description}
                        onChange={(event) => updateRow(row.key, { description: event.target.value })}
                        placeholder="z. B. Live-Auftritt am 12.12. (2 × 45 Min.)"
                        className="min-h-10 flex-1 resize-y"
                      />
                      <Button variant="ghost" size="icon" icon={<Trash2 />} aria-label={`Position ${index + 1} entfernen`} onClick={() => removeRow(row.key)} />
                    </div>
                    <div className={cn("mt-2 grid gap-2 pl-7", noVat ? "grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,1fr)] sm:grid-cols-[5rem_8rem_9rem_minmax(0,1fr)]" : "grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,1fr)] sm:grid-cols-[5rem_8rem_9rem_6rem_minmax(0,1fr)]")}>
                      <Input aria-label="Menge" inputMode="decimal" value={row.quantity} onChange={(event) => updateRow(row.key, { quantity: event.target.value })} />
                      <Input aria-label="Einheit" list="invoice-units" value={row.unit} onChange={(event) => updateRow(row.key, { unit: event.target.value })} />
                      <Input aria-label="Einzelpreis in Euro" inputMode="decimal" value={row.price} placeholder="0,00 €" onChange={(event) => updateRow(row.key, { price: event.target.value })} />
                      {!noVat ? (
                        <Select aria-label="Steuersatz" value={String(row.vatRate)} onChange={(event) => updateRow(row.key, { vatRate: Number(event.target.value) })}>
                          <option value="19">19 %</option>
                          <option value="7">7 %</option>
                          <option value="0">0 %</option>
                        </Select>
                      ) : null}
                      <span className="col-span-3 self-center text-right text-sm font-semibold tabular-nums sm:col-span-1">{money(line)}</span>
                    </div>
                  </div>
                );
              })}
              <datalist id="invoice-units">{UNITS.map((unit) => <option key={unit} value={unit} />)}</datalist>
              <Button size="sm" icon={<Plus />} onClick={addRow}>Position</Button>
            </div>
            <div className="mt-5 border-t border-border pt-4">
              <Totals totals={totals} smallBusiness={detail.smallBusiness} reverseCharge={reverseCharge} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Texte" description="Optional – sonst wird der Einleitungstext aus den Rechnungsdaten verwendet." />
            <div className="space-y-3">
              <Field label="Einleitung" optional>{(id) => <Textarea id={id} rows={2} value={intro} onChange={(event) => { setIntro(event.target.value); touch(); }} placeholder="vielen Dank für die Zusammenarbeit …" />}</Field>
              <Field label="Hinweise" optional hint="z. B. Skonto-Vereinbarung, Bestellnummer des Veranstalters">{(id) => <Textarea id={id} rows={2} value={notes} onChange={(event) => { setNotes(event.target.value); touch(); }} />}</Field>
            </div>
          </Card>
        </div>
        <div className="min-w-0 space-y-6 xl:sticky xl:top-4 xl:self-start">
          <Checklist missing={detail.missing} smallBusiness={detail.smallBusiness} reverseCharge={reverseCharge} />
          <Preview invoiceId={invoice.id} version={previewVersion} />
        </div>
      </div>
      {bandId ? <InvoiceSettingsDialog bandId={bandId} open={settingsOpen} onClose={() => setSettingsOpen(false)} onSaved={() => { void refresh(); setPreviewVersion((value) => value + 1); }} /> : null}
    </>
  );
}

function IssuedView({ detail, refresh }: { detail: InvoiceDetail; refresh: () => Promise<InvoiceDetail | undefined> }) {
  const invoice = detail.invoice;
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const { can } = useSession();
  const manage = can("finance.manage");
  const [busy, setBusy] = useState<string | null>(null);
  const [todayKey] = useState(() => new Date().toISOString().slice(0, 10));
  const status = invoiceStatus(invoice, todayKey);
  const recipient = invoice.recipient;
  const pdf = `/api/invoices/${invoice.id}/pdf`;

  const run = async (action: "pay" | "cancel" | "duplicate") => {
    if (action === "pay") {
      const ok = await confirm({
        title: "Als bezahlt markieren?",
        description: invoice.eventId ? "Die Gage wird in der Bandkasse verbucht – falls sie dort nicht schon steht." : "Der Betrag wird als Einnahme in der Bandkasse verbucht.",
        confirmLabel: "Bezahlt",
      });
      if (!ok) return;
    }
    if (action === "cancel") {
      const ok = await confirm({
        title: `Rechnung ${invoice.number} stornieren?`,
        description: "Es wird eine Stornorechnung mit eigener Nummer erstellt, die alle Beträge negativ ausweist. Die Originalrechnung bleibt erhalten (Aufbewahrungspflicht 8 Jahre). Danach kannst du sie duplizieren und korrigiert neu stellen.",
        confirmLabel: "Stornorechnung erstellen",
        tone: "danger",
      });
      if (!ok) return;
    }
    setBusy(action);
    try {
      const result = await api.post<{ invoice: { id: string } }>(`/api/invoices/${invoice.id}/${action}`);
      if (action === "pay") {
        toast.success("Als bezahlt markiert und in der Bandkasse verbucht.");
        await refresh();
      } else {
        toast.success(action === "cancel" ? "Stornorechnung erstellt." : "Kopie als neuer Entwurf angelegt.");
        router.push(`/app/finance/invoices/${result.invoice.id}`);
      }
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const mailto = recipient.email
    ? `mailto:${encodeURIComponent(recipient.email)}?subject=${encodeURIComponent(`Rechnung ${invoice.number}`)}&body=${encodeURIComponent(`Hallo ${recipient.name || ""},\n\nanbei unsere Rechnung ${invoice.number} über ${money(invoice.grossCents)}${invoice.dueDate ? `, zahlbar bis ${formatDay(invoice.dueDate)}` : ""}.\n\nViele Grüße`)}`
    : null;

  return (
    <>
      <PageHeader
        back={<Link href="/app/finance/invoices" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ArrowLeft className="size-4" />Rechnungen</Link>}
        title={`${invoice.cancelsNumber ? "Stornorechnung" : "Rechnung"} ${invoice.number ?? ""}`}
        description={<span className="inline-flex flex-wrap items-center gap-2"><Badge tone={status.tone}>{status.label}</Badge>{recipientLabel(recipient)}</span>}
        actions={(
          <>
            <Button icon={<Download />} onClick={() => window.open(`${pdf}?download=1`, "_blank")}>PDF</Button>
            {mailto ? <Button icon={<Mail />} onClick={() => { window.location.href = mailto; }}>E-Mail</Button> : null}
            {manage ? <Button icon={<Copy />} loading={busy === "duplicate"} onClick={() => void run("duplicate")}>Duplizieren</Button> : null}
            {manage && (invoice.status === "issued" || invoice.status === "paid") && !invoice.cancelsNumber ? (
              <Button variant="ghost" icon={<Ban />} loading={busy === "cancel"} onClick={() => void run("cancel")}>Stornieren</Button>
            ) : null}
            {manage && invoice.status === "issued" && !invoice.cancelsNumber ? (
              <Button variant="primary" icon={<Wallet />} loading={busy === "pay"} onClick={() => void run("pay")}>Bezahlt</Button>
            ) : null}
          </>
        )}
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,34rem)]">
        <div className="min-w-0 space-y-6">
          <Card>
            <dl className="grid gap-4 text-sm sm:grid-cols-4">
              <div><dt className="text-xs text-muted">Rechnungsdatum</dt><dd className="font-medium">{formatDay(invoice.issueDate)}</dd></div>
              <div><dt className="text-xs text-muted">Leistungsdatum</dt><dd className="font-medium">{formatDay(invoice.serviceDate)}{invoice.serviceDateTo ? ` – ${formatDay(invoice.serviceDateTo)}` : ""}</dd></div>
              <div><dt className="text-xs text-muted">Fällig am</dt><dd className={cn("font-medium", status.label === "Überfällig" && "text-danger")}>{formatDay(invoice.dueDate)}</dd></div>
              <div><dt className="text-xs text-muted">Betrag</dt><dd className="font-semibold tabular-nums">{money(invoice.grossCents)}</dd></div>
            </dl>
            {invoice.paidAt ? <p className="mt-4 text-sm text-success">Bezahlt am {formatDay(invoice.paidAt)} – in der Bandkasse verbucht.</p> : null}
            {invoice.cancelledAt ? <p className="mt-4 text-sm text-muted">Storniert am {formatDay(invoice.cancelledAt)}.</p> : null}
            {invoice.cancelsNumber ? <p className="mt-4 text-sm text-muted">Storniert die Rechnung {invoice.cancelsNumber}.</p> : null}
            {invoice.event ? <p className="mt-2 text-sm"><Link className="text-accent-text hover:underline" href={`/app/events/${invoice.event.id}`}>Gig: {invoice.event.title}</Link></p> : null}
          </Card>
          <Card>
            <CardHeader title="Empfänger" />
            <address className="text-sm not-italic leading-relaxed">
              {recipient.company ? <>{recipient.company}<br /></> : null}
              {recipient.name ? <>{recipient.name}<br /></> : null}
              {recipient.street}<br />
              {recipient.zip} {recipient.city}{recipient.country ? <><br />{recipient.country}</> : null}
              {recipient.vatId ? <><br /><span className="text-muted">USt-IdNr. {recipient.vatId}</span></> : null}
            </address>
          </Card>
          <Card>
            <CardHeader title="Positionen" />
            <ul className="divide-y divide-border text-sm">
              {invoice.items.map((item, index) => (
                <li key={index} className="flex gap-3 py-2.5">
                  <span className="w-5 shrink-0 text-xs tabular-nums text-subtle">{index + 1}.</span>
                  <div className="min-w-0 flex-1">
                    <p className="whitespace-pre-line">{item.description}</p>
                    <p className="text-xs text-muted">{String(item.quantity).replace(".", ",")} {item.unit} × {money(item.unitPriceCents)}{!invoice.smallBusiness && !invoice.reverseCharge ? ` · ${item.vatRate} % USt.` : ""}</p>
                  </div>
                  <span className="shrink-0 font-medium tabular-nums">{money(detail.totals.lines[index] ?? 0)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 border-t border-border pt-4">
              <Totals totals={detail.totals} smallBusiness={invoice.smallBusiness} reverseCharge={invoice.reverseCharge} />
            </div>
          </Card>
        </div>
        <div className="min-w-0 xl:sticky xl:top-4 xl:self-start">
          <Preview invoiceId={invoice.id} version={0} />
        </div>
      </div>
    </>
  );
}

export function InvoiceEditor({ invoiceId }: { invoiceId: string }) {
  const { can } = useSession();
  const { data, error, isLoading, mutate } = useSWR<InvoiceDetail>(can("finance.view") ? `/api/invoices/${invoiceId}` : null);
  const refresh = useCallback(() => mutate(), [mutate]);

  if (!can("finance.view")) return <EmptyState icon={<FileText />} title="Kein Zugriff" description="Rechnungen sehen nur Bandmitglieder." />;
  if (error) return <EmptyState icon={<FileText />} title="Rechnung nicht gefunden" action={<Link className="text-accent-text hover:underline" href="/app/finance/invoices">Zur Übersicht</Link>} />;
  if (isLoading || !data) return <Skeleton className="h-[32rem]" />;
  if (data.invoice.status === "draft" && can("finance.manage")) return <DraftEditor key={data.invoice.id} detail={data} refresh={refresh} />;
  return <IssuedView key={`${data.invoice.id}-${data.invoice.status}`} detail={data} refresh={refresh} />;
}
