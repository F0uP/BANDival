"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { ArrowLeft, FileText, Plus, Settings2, TriangleAlert } from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, PageHeader, Skeleton } from "@/components/ui/display";
import { Segmented } from "@/components/ui/navigation";
import { useToast } from "@/components/ui/feedback";
import { useSession } from "@/components/providers/session";
import { InvoiceSettingsDialog } from "@/components/finance/invoice-settings-dialog";
import {
  formatDay, invoiceStatus, issuerIncomplete, money, recipientLabel, type InvoiceRow, type InvoiceSettings,
} from "@/components/finance/invoice-shared";
import { t } from "@/lib/i18n";

type Filter = "all" | "draft" | "open" | "paid" | "cancelled";

function Tile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "danger" }) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wider text-muted">{label}</span>
      <span className={tone === "danger" ? "text-2xl font-semibold tabular-nums tracking-tight text-danger" : "text-2xl font-semibold tabular-nums tracking-tight"}>{value}</span>
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </Card>
  );
}

export function InvoicesView() {
  const { bandId, can } = useSession();
  const router = useRouter();
  const toast = useToast();
  const allowed = can("finance.view");
  const manage = can("finance.manage");
  const { data, isLoading } = useSWR<{ invoices: InvoiceRow[] }>(bandId && allowed ? `/api/bands/${bandId}/invoices` : null);
  const settings = useSWR<{ settings: InvoiceSettings }>(bandId && allowed ? `/api/bands/${bandId}/invoice-settings` : null);
  const [filter, setFilter] = useState<Filter>("all");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [todayKey] = useState(() => new Date().toISOString().slice(0, 10));

  const invoices = useMemo(() => data?.invoices ?? [], [data]);
  const stats = useMemo(() => {
    const open = invoices.filter((invoice) => invoice.status === "issued" && !invoice.cancelsNumber);
    const overdue = open.filter((invoice) => invoice.dueDate && invoice.dueDate < todayKey);
    const year = todayKey.slice(0, 4);
    const paid = invoices.filter((invoice) => invoice.status === "paid" && (invoice.paidAt ?? "").startsWith(year));
    return {
      open: open.reduce((sum, invoice) => sum + invoice.grossCents, 0),
      openCount: open.length,
      overdue: overdue.reduce((sum, invoice) => sum + invoice.grossCents, 0),
      overdueCount: overdue.length,
      paid: paid.reduce((sum, invoice) => sum + invoice.grossCents, 0),
      year,
    };
  }, [invoices, todayKey]);

  const visible = invoices.filter((invoice) => {
    if (filter === "all") return true;
    if (filter === "open") return invoice.status === "issued" && !invoice.cancelsNumber;
    if (filter === "cancelled") return invoice.status === "cancelled" || Boolean(invoice.cancelsNumber);
    return invoice.status === filter;
  });

  if (!allowed) return <EmptyState icon={<FileText />} title={t("Kein Zugriff")} description={t("Rechnungen sehen nur Bandmitglieder.")} />;

  const create = async () => {
    if (!bandId) return;
    setCreating(true);
    try {
      const result = await api.post<{ invoice: { id: string } }>(`/api/bands/${bandId}/invoices`, {});
      router.push(`/app/finance/invoices/${result.invoice.id}`);
    } catch (error) {
      toast.error(errorMessage(error));
      setCreating(false);
    }
  };

  const incomplete = issuerIncomplete(settings.data?.settings);

  return (
    <>
      <PageHeader
        back={<Link href="/app/finance" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ArrowLeft className="size-4" />{t("Bandkasse")}</Link>}
        title={t("Rechnungen")}
        description={t("Fortlaufend nummeriert, mit allen Pflichtangaben – als PDF mit GiroCode.")}
        actions={manage ? (
          <>
            <Button icon={<Settings2 />} onClick={() => setSettingsOpen(true)}>{t("Rechnungsdaten")}</Button>
            <Button variant="primary" icon={<Plus />} loading={creating} onClick={() => void create()}>{t("Neue Rechnung")}</Button>
          </>
        ) : null}
      />

      {manage && incomplete ? (
        <Card className="mb-6 flex flex-col gap-3 border-warning/40 bg-warning-soft/40 sm:flex-row sm:items-center">
          <TriangleAlert className="size-5 shrink-0 text-warning" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium">{t("Rechnungsdaten unvollständig")}</p>
            <p className="text-muted">{t("Für gültige Rechnungen braucht ihr Name, Anschrift und Steuernummer bzw. USt-IdNr. – Entwürfe gehen trotzdem schon.")}</p>
          </div>
          <Button size="sm" onClick={() => setSettingsOpen(true)}>{t("Jetzt ergänzen")}</Button>
        </Card>
      ) : null}

      {isLoading || !data ? <Skeleton className="h-80" /> : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <Tile label={t("Offen")} value={money(stats.open)} hint={`${stats.openCount} Rechnung${stats.openCount === 1 ? "" : "en"}`} />
            <Tile label={t("Überfällig")} value={money(stats.overdue)} hint={`${stats.overdueCount} Rechnung${stats.overdueCount === 1 ? "" : "en"}`} tone={stats.overdueCount ? "danger" : undefined} />
            <Tile label={`Bezahlt ${stats.year}`} value={money(stats.paid)} />
          </div>

          <Card padded={false}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
              <h2 className="font-semibold">{t("Alle Rechnungen")}</h2>
              <Segmented
                size="sm"
                value={filter}
                onChange={setFilter}
                items={[
                  { value: "all", label: t("Alle") },
                  { value: "draft", label: t("Entwürfe") },
                  { value: "open", label: t("Offen") },
                  { value: "paid", label: t("Bezahlt") },
                  { value: "cancelled", label: t("Storno") },
                ]}
              />
            </div>
            {visible.length === 0 ? (
              <EmptyState
                className="py-12"
                icon={<FileText />}
                title={invoices.length ? t("Nichts in diesem Filter") : t("Noch keine Rechnungen")}
                description={invoices.length ? undefined : t("Erstelle eine Rechnung frei oder direkt aus einem Gig (Termin → Gig → Rechnung erstellen).")}
              />
            ) : (
              <ul className="divide-y divide-border">
                {visible.map((invoice) => {
                  const status = invoiceStatus(invoice, todayKey);
                  return (
                    <li key={invoice.id}>
                      <Link href={`/app/finance/invoices/${invoice.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted"><FileText className="size-4" /></span>
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
                            <span className="truncate">{invoice.number ?? t("Entwurf")}</span>
                            <Badge tone={status.tone}>{status.label}</Badge>
                          </p>
                          <p className="truncate text-xs text-muted">
                            {recipientLabel(invoice.recipient)}
                            {invoice.event ? ` · ${invoice.event.title}` : ""}
                            {invoice.cancelsNumber ? t(` · Storno zu ${invoice.cancelsNumber}`) : ""}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-semibold tabular-nums">{money(invoice.status === "draft" ? invoice.items.reduce((sum, item) => sum + Math.round(item.quantity * item.unitPriceCents), 0) : invoice.grossCents)}</p>
                          <p className="text-xs text-muted">{invoice.issueDate ? formatDay(invoice.issueDate) : `angelegt ${formatDay(invoice.createdAt)}`}</p>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      )}
      {bandId && manage ? <InvoiceSettingsDialog bandId={bandId} open={settingsOpen} onClose={() => setSettingsOpen(false)} onSaved={() => void settings.mutate()} /> : null}
    </>
  );
}
