"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { Download, FileText, PiggyBank, Plus, Repeat, Table2, Trash2, BarChart3 } from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import { cn } from "@/lib/client/cn";
import { formatDate } from "@/lib/client/format";
import { Button, ButtonLink } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Skeleton } from "@/components/ui/display";
import { Field, Input, Select, Switch } from "@/components/ui/form";
import { Segmented } from "@/components/ui/navigation";
import { useConfirm, useToast } from "@/components/ui/feedback";
import { useSession } from "@/components/providers/session";

type FinanceData = {
  year: number;
  balanceCents: number;
  transactions: Array<{ id: string; date: string; amountCents: number; category: string; description: string; recurringId: string | null; event: { id: string; title: string } | null; createdBy: { displayName: string } | null }>;
  recurring: Array<{ id: string; amountCents: number; category: string; description: string; dayOfMonth: number; active: boolean; lastRunMonth: string | null }>;
  months: Array<{ month: number; income: number; expense: number }>;
  categories: Array<{ category: string; amountCents: number }>;
  openFees: Array<{ id: string; title: string; startsAt: string; feeCents: number; feeStatus: string }>;
  members: number;
};

const CATEGORIES = ["Gage", "Proberaum", "Equipment", "Merch", "Fahrtkosten", "Werbung", "Studio", "Mitgliedsbeitrag", "Sonstiges"];
const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const money = (cents: number) => euro.format(cents / 100);

function parseEuro(value: string): number | null {
  const normalized = value.trim().replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const number = Number(normalized);
  return normalized && Number.isFinite(number) ? Math.round(number * 100) : null;
}

function StatTile({ label, value, tone, hint }: { label: string; value: string; tone?: "positive" | "negative"; hint?: string }) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wider text-muted">{label}</span>
      <span className={cn("text-2xl font-semibold tabular-nums tracking-tight", tone === "negative" && "text-danger")}>{value}</span>
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </Card>
  );
}

/** Income above, expenses below one shared zero line – one axis, two validated hues, hover tooltip, table fallback. */
function MonthlyChart({ months }: { months: FinanceData["months"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const max = Math.max(1, ...months.map((month) => Math.max(month.income, month.expense)));
  const active = hover !== null ? months[hover] : null;

  return (
    <Card>
      <CardHeader
        title="Einnahmen & Ausgaben pro Monat"
        action={(
          <Button size="icon-sm" variant="ghost" onClick={() => setTable((value) => !value)} aria-label={table ? "Als Diagramm" : "Als Tabelle"} title={table ? "Als Diagramm" : "Als Tabelle"}>
            {table ? <BarChart3 /> : <Table2 />}
          </Button>
        )}
      />
      <div className="mb-3 flex items-center gap-4 text-xs text-muted" aria-hidden>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[var(--viz-1)]" /> Einnahmen</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[var(--viz-2)]" /> Ausgaben</span>
      </div>
      {table ? (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-muted"><th className="py-1">Monat</th><th className="text-right">Einnahmen</th><th className="text-right">Ausgaben</th><th className="text-right">Saldo</th></tr></thead>
          <tbody>
            {months.map((month) => (
              <tr key={month.month} className="border-t border-border">
                <td className="py-1.5">{MONTHS[month.month - 1]}</td>
                <td className="text-right tabular-nums">{money(month.income)}</td>
                <td className="text-right tabular-nums">{money(-month.expense)}</td>
                <td className="text-right tabular-nums">{money(month.income - month.expense)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="relative" onMouseLeave={() => setHover(null)}>
          <div className="relative flex h-56" role="img" aria-label="Einnahmen und Ausgaben je Monat">
            <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-border-strong" aria-hidden />
            {months.map((month, index) => {
              const income = Math.max(0, (month.income / max) * 46);
              const expense = Math.max(0, (month.expense / max) * 46);
              return (
                <div
                  key={month.month}
                  className={cn("relative flex flex-1 flex-col items-center rounded-lg", hover === index && "bg-surface-2")}
                  onMouseEnter={() => setHover(index)}
                  onFocus={() => setHover(index)}
                  tabIndex={0}
                  aria-label={`${MONTHS[index]}: Einnahmen ${money(month.income)}, Ausgaben ${money(month.expense)}`}
                >
                  <div className="flex h-1/2 w-full items-end justify-center pb-px">
                    {income > 0 ? <div className="w-1/2 max-w-7 rounded-t-[4px] bg-[var(--viz-1)]" style={{ height: `${income * 2}%` }} /> : null}
                  </div>
                  <div className="flex h-1/2 w-full items-start justify-center pt-px">
                    {expense > 0 ? <div className="w-1/2 max-w-7 rounded-b-[4px] bg-[var(--viz-2)]" style={{ height: `${expense * 2}%` }} /> : null}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex">
            {months.map((month) => <span key={month.month} className="flex-1 text-center text-[11px] text-muted">{MONTHS[month.month - 1]}</span>)}
          </div>
          {active ? (
            <div className="pointer-events-none absolute top-0 z-10 rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg" style={{ left: `${Math.min(78, ((hover ?? 0) / 12) * 100 + 4)}%` }}>
              <p className="font-semibold">{MONTHS[active.month - 1]}</p>
              <p className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-[var(--viz-1)]" /> Einnahmen <span className="ml-auto pl-3 tabular-nums">{money(active.income)}</span></p>
              <p className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-[var(--viz-2)]" /> Ausgaben <span className="ml-auto pl-3 tabular-nums">{money(-active.expense)}</span></p>
              <p className="mt-1 border-t border-border pt-1 tabular-nums">Saldo {money(active.income - active.expense)}</p>
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
}

function FeeSplit({ members, suggestion }: { members: number; suggestion: number | null }) {
  const [amount, setAmount] = useState(suggestion !== null ? (suggestion / 100).toFixed(2).replace(".", ",") : "");
  const [share, setShare] = useState(20);
  const [people, setPeople] = useState(Math.max(1, members));
  const cents = parseEuro(amount) ?? 0;
  const bandPart = Math.round((cents * share) / 100);
  const perPerson = people > 0 ? Math.floor((cents - bandPart) / people) : 0;
  return (
    <Card>
      <CardHeader title="Gagen-Aufteilung" description="Wie viel geht in die Bandkasse, wie viel an jede:n?" />
      <div className="grid gap-3">
        <Field label="Gage (€)">{(id) => <Input id={id} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="500,00" />}</Field>
        <Field label={`Anteil Bandkasse: ${share} %`}>{(id) => <input id={id} type="range" min={0} max={100} step={5} value={share} onChange={(event) => setShare(Number(event.target.value))} className="w-full accent-[var(--accent)]" />}</Field>
        <Field label="Personen">{(id) => <Input id={id} type="number" min={1} value={people} onChange={(event) => setPeople(Math.max(1, Number(event.target.value) || 1))} />}</Field>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl bg-surface-2 p-3"><p className="text-xs text-muted">In die Bandkasse</p><p className="text-lg font-semibold tabular-nums">{money(bandPart)}</p></div>
        <div className="rounded-xl bg-surface-2 p-3"><p className="text-xs text-muted">Pro Person</p><p className="text-lg font-semibold tabular-nums">{money(perPerson)}</p></div>
      </div>
    </Card>
  );
}

function TransactionDialog({ open, onClose, onSaved, bandId }: { open: boolean; onClose: () => void; onSaved: () => void; bandId: string }) {
  const [type, setType] = useState<"income" | "expense">("expense");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState("Proberaum");
  const [description, setDescription] = useState("");
  const [recurring, setRecurring] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const save = async () => {
    const cents = parseEuro(amount);
    if (!cents) {
      toast.error("Bitte einen Betrag eingeben.");
      return;
    }
    const signed = type === "income" ? Math.abs(cents) : -Math.abs(cents);
    setSaving(true);
    try {
      if (recurring) {
        await api.post(`/api/bands/${bandId}/finance/recurring`, { amountCents: signed, category, description: description.trim() || category, dayOfMonth: Number(date.slice(8, 10)) });
      } else {
        await api.post(`/api/bands/${bandId}/finance`, { amountCents: signed, date, category, description: description.trim() || category });
      }
      onSaved();
      onClose();
      setAmount("");
      setDescription("");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Neue Buchung" size="sm">
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <Segmented className="w-full" value={type} onChange={(value) => setType(value)} items={[{ value: "expense", label: "Ausgabe" }, { value: "income", label: "Einnahme" }]} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Betrag (€)">{(id) => <Input id={id} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="49,90" autoFocus required />}</Field>
          <Field label={recurring ? "Erste Buchung" : "Datum"}>{(id) => <Input id={id} type="date" value={date} onChange={(event) => setDate(event.target.value)} required />}</Field>
        </div>
        <Field label="Kategorie">
          {(id) => (
            <>
              <Input id={id} list={`${id}-list`} value={category} onChange={(event) => setCategory(event.target.value)} required />
              <datalist id={`${id}-list`}>{CATEGORIES.map((entry) => <option key={entry} value={entry} />)}</datalist>
            </>
          )}
        </Field>
        <Field label="Beschreibung">{(id) => <Input id={id} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="z. B. Miete Proberaum November" />}</Field>
        <Switch checked={recurring} onChange={setRecurring} label="Monatlicher Dauerauftrag" description={`Wird jeden Monat am ${Number(date.slice(8, 10))}. automatisch gebucht.`} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Abbrechen</Button>
          <Button type="submit" variant="primary" loading={saving}>Buchen</Button>
        </div>
      </form>
    </Dialog>
  );
}

export function FinanceView() {
  const { bandId, can } = useSession();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const { data, isLoading, mutate } = useSWR<FinanceData>(bandId && can("finance.view") ? `/api/bands/${bandId}/finance?year=${year}` : null);
  const [dialog, setDialog] = useState(false);
  const [category, setCategory] = useState<string>("");
  const confirm = useConfirm();
  const toast = useToast();
  const manage = can("finance.manage");

  const yearIncome = useMemo(() => data?.months.reduce((sum, month) => sum + month.income, 0) ?? 0, [data]);
  const yearExpense = useMemo(() => data?.months.reduce((sum, month) => sum + month.expense, 0) ?? 0, [data]);
  const openFees = data?.openFees.reduce((sum, fee) => sum + fee.feeCents, 0) ?? 0;
  const transactions = (data?.transactions ?? []).filter((entry) => !category || entry.category === category);
  const lastFee = data?.transactions.find((entry) => entry.category === "Gage" && entry.amountCents > 0)?.amountCents ?? null;

  if (!can("finance.view")) {
    return <EmptyState icon={<PiggyBank />} title="Kein Zugriff" description="Die Bandkasse sehen nur Bandmitglieder." />;
  }

  const remove = async (id: string, description: string) => {
    const ok = await confirm({ title: `„${description}“ löschen?`, confirmLabel: "Löschen", tone: "danger" });
    if (!ok || !bandId) return;
    await api.delete(`/api/bands/${bandId}/finance/${id}`).catch((error) => toast.error(errorMessage(error)));
    await mutate();
  };

  return (
    <>
      <PageHeader
        title="Bandkasse"
        description="Gagen, Proberaum, Equipment – alles an einem Ort."
        actions={(
          <div className="flex gap-2">
            <Select value={String(year)} onChange={(event) => setYear(Number(event.target.value))} className="h-10 w-auto" aria-label="Jahr">
              {Array.from({ length: 6 }, (_, offset) => new Date().getFullYear() - offset).map((value) => <option key={value} value={value}>{value}</option>)}
            </Select>
            <ButtonLink href="/app/finance/invoices" icon={<FileText />}>Rechnungen</ButtonLink>
            <Button icon={<Download />} onClick={() => window.open(`/api/bands/${bandId}/finance/export?year=${year}`, "_blank")}>CSV</Button>
            {manage ? <Button variant="primary" icon={<Plus />} onClick={() => setDialog(true)}>Buchung</Button> : null}
          </div>
        )}
      />
      {isLoading || !data ? <Skeleton className="h-96" /> : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Kassenstand" value={money(data.balanceCents)} tone={data.balanceCents < 0 ? "negative" : "positive"} hint="alle Jahre" />
            <StatTile label={`Einnahmen ${year}`} value={money(yearIncome)} />
            <StatTile label={`Ausgaben ${year}`} value={money(-yearExpense)} />
            <StatTile label="Offene Gagen" value={money(openFees)} hint={`${data.openFees.length} Gig${data.openFees.length === 1 ? "" : "s"}`} />
          </div>

          <MonthlyChart months={data.months} />

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <Card padded={false}>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                <h2 className="font-semibold">Buchungen</h2>
                <Select value={category} onChange={(event) => setCategory(event.target.value)} className="h-8 w-auto text-sm" aria-label="Kategorie filtern">
                  <option value="">Alle Kategorien</option>
                  {data.categories.map((entry) => <option key={entry.category} value={entry.category}>{entry.category} ({money(entry.amountCents)})</option>)}
                </Select>
              </div>
              {transactions.length === 0 ? <p className="px-4 py-8 text-center text-sm text-muted">Keine Buchungen in {year}.</p> : (
                <ul className="divide-y divide-border">
                  {transactions.map((entry) => (
                    <li key={entry.id} className="group flex items-center gap-3 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{entry.description}</p>
                        <p className="text-xs text-muted">
                          {formatDate(`${entry.date}T12:00:00`)} · {entry.category}
                          {entry.recurringId ? " · Dauerauftrag" : ""}
                          {entry.event ? <> · <Link href={`/app/events/${entry.event.id}`} className="hover:underline">{entry.event.title}</Link></> : null}
                        </p>
                      </div>
                      <span className={cn("shrink-0 font-semibold tabular-nums", entry.amountCents < 0 ? "text-fg" : "text-success")}>{money(entry.amountCents)}</span>
                      {manage ? (
                        <button type="button" onClick={() => void remove(entry.id, entry.description)} className="rounded-lg p-1 text-subtle opacity-0 hover:text-danger group-hover:opacity-100 focus:opacity-100" aria-label="Löschen">
                          <Trash2 className="size-4" />
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <div className="space-y-6">
              {data.openFees.length ? (
                <Card>
                  <CardHeader title="Offene Gagen" />
                  <ul className="space-y-2">
                    {data.openFees.map((fee) => (
                      <li key={fee.id} className="flex items-center justify-between gap-2 text-sm">
                        <Link href={`/app/events/${fee.id}`} className="min-w-0 truncate hover:underline">{fee.title}</Link>
                        <span className="flex items-center gap-2"><Badge tone={fee.feeStatus === "invoiced" ? "accent" : "warning"}>{fee.feeStatus === "invoiced" ? "Rechnung" : "Offen"}</Badge><span className="tabular-nums">{money(fee.feeCents)}</span></span>
                      </li>
                    ))}
                  </ul>
                </Card>
              ) : null}
              <Card>
                <CardHeader title="Daueraufträge" icon={<Repeat />} />
                {data.recurring.length === 0 ? <p className="text-sm text-muted">z. B. Proberaummiete – wird automatisch jeden Monat gebucht.</p> : (
                  <ul className="space-y-2">
                    {data.recurring.map((entry) => (
                      <li key={entry.id} className="flex items-center gap-2 text-sm">
                        <span className={cn("min-w-0 flex-1 truncate", !entry.active && "text-subtle line-through")}>{entry.description} · am {entry.dayOfMonth}.</span>
                        <span className="tabular-nums">{money(entry.amountCents)}</span>
                        {manage ? (
                          <>
                            <Button size="sm" variant="ghost" onClick={async () => { await api.patch(`/api/bands/${bandId}/finance/recurring/${entry.id}`, { active: !entry.active }); await mutate(); }}>{entry.active ? "Pause" : "Aktiv"}</Button>
                            <button type="button" className="p-1 text-subtle hover:text-danger" aria-label="Dauerauftrag löschen" onClick={async () => { await api.delete(`/api/bands/${bandId}/finance/recurring/${entry.id}`); await mutate(); }}><Trash2 className="size-4" /></button>
                          </>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              <FeeSplit key={lastFee ?? "none"} members={data.members} suggestion={lastFee} />
            </div>
          </div>
        </div>
      )}
      {bandId && manage ? <TransactionDialog open={dialog} onClose={() => setDialog(false)} onSaved={() => void mutate()} bandId={bandId} /> : null}
    </>
  );
}
