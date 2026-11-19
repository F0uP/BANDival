"use client";

import Link from "next/link";
import useSWR from "swr";
import { AlertTriangle, FileDown, FileSpreadsheet, Link2, ListMusic, Trash2 } from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import { formatRelative } from "@/lib/client/format";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/display";
import { useConfirm, useToast } from "@/components/ui/feedback";
import { t } from "@/lib/i18n";

type Share = { id: string; url: string; eventId: string | null; createdAt: string; expiresAt: string | null; lastViewedAt: string | null };

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Login-free link to the rider (of one gig, or the band's general rider) – for the venue's technician. */
export function RiderShareControls({ bandId, eventId, manage }: { bandId: string; eventId: string | null; manage: boolean }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { data, mutate } = useSWR<{ shares: Share[] }>(manage ? `/api/bands/${bandId}/rider/shares?${eventId ? `eventId=${eventId}` : "general=1"}` : null);
  const share = data?.shares[0];
  if (!manage) return null;

  const create = async () => {
    try {
      const result = await api.post<{ share: Share }>(`/api/bands/${bandId}/rider/shares`, { eventId });
      await mutate();
      toast.success((await copy(result.share.url)) ? t("Link kopiert – schick ihn an die Technik.") : t("Link erstellt."));
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const revoke = async () => {
    if (!share) return;
    const ok = await confirm({ title: t("Link zurückziehen?"), description: t("Wer den Link hat, sieht den Rider danach nicht mehr."), confirmLabel: t("Zurückziehen"), tone: "danger" });
    if (!ok) return;
    await api.delete(`/api/bands/${bandId}/rider/shares/${share.id}`).catch((error) => toast.error(errorMessage(error)));
    await mutate();
  };

  if (!share) {
    return <Button size="sm" variant="subtle" icon={<Link2 />} onClick={() => void create()}>{t("Link für die Technik")}</Button>;
  }
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface-2/50 px-3 py-2.5 text-sm">
      <Link2 className="size-4 shrink-0 text-accent-text" />
      <span className="min-w-0 flex-1 truncate font-mono text-[12px]" title={share.url}>{share.url}</span>
      <span className="type-meta text-[11px] text-muted">
        {share.lastViewedAt ? t("zuletzt geöffnet {when}", { when: formatRelative(share.lastViewedAt) }) : t("noch nicht geöffnet")}
      </span>
      <Button size="sm" variant="ghost" onClick={() => void copy(share.url).then((ok) => (ok ? toast.success(t("Link kopiert.")) : toast.error(t("Kopieren nicht möglich – bitte manuell markieren."))))}>{t("Kopieren")}</Button>
      <Button size="icon-sm" variant="ghost" aria-label={t("Link zurückziehen")} onClick={() => void revoke()}><Trash2 /></Button>
    </div>
  );
}

type GemaList = {
  source: "played" | "setlist";
  rows: Array<{ position: number; title: string; composers: string; incomplete: boolean }>;
  totalSeconds: number;
};

/** GEMA set list ("Musikfolge") of a gig – PDF for the portal/promoter, CSV for spreadsheets. */
export function GemaCard({ eventId, className }: { eventId: string; className?: string }) {
  const { data } = useSWR<{ gema: GemaList }>(`/api/events/${eventId}/gema`);
  const list = data?.gema;
  const incomplete = list?.rows.filter((row) => row.incomplete) ?? [];

  return (
    <Card className={className}>
      <CardHeader
        title={t("GEMA-Musikfolge")}
        icon={<ListMusic />}
        description={t("Alle gespielten Werke mit Komponist:innen, Verlag und Dauer – zum Einreichen im GEMA-Portal oder für den Veranstalter.")}
        action={list && list.rows.length > 0 ? (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" icon={<FileSpreadsheet />} onClick={() => window.open(`/api/events/${eventId}/gema?format=csv`, "_blank")}>{t("CSV")}</Button>
            <Button size="sm" icon={<FileDown />} onClick={() => window.open(`/api/events/${eventId}/gema?format=pdf`, "_blank")}>{t("PDF")}</Button>
          </div>
        ) : undefined}
      />
      {!list ? <div className="h-10 animate-pulse rounded-lg bg-surface-2" /> : list.rows.length === 0 ? (
        <p className="text-sm text-muted">{t("Verknüpfe eine Setlist oder trage im Protokoll ein, was gespielt wurde.")}</p>
      ) : (
        <div className="space-y-2 text-sm">
          <p className="text-muted">
            {list.source === "played" ? t("{count} gespielte Titel laut Protokoll.", { count: list.rows.length }) : t("{count} Titel aus der Setlist (noch kein Protokoll).", { count: list.rows.length })}
          </p>
          {incomplete.length > 0 ? (
            <div className="rounded-xl border border-warning/30 bg-warning-soft px-3.5 py-2.5">
              <p className="flex items-center gap-2 font-medium text-warning"><AlertTriangle className="size-4" />{incomplete.length === 1 ? t("Bei einem Titel fehlen Komponist:innen") : t("Bei {count} Titeln fehlen Komponist:innen", { count: incomplete.length })}</p>
              <p className="mt-1 text-muted">
                {incomplete.slice(0, 6).map((row, index) => (
                  <span key={row.position}>{index > 0 ? ", " : ""}{row.title}</span>
                ))}
                {incomplete.length > 6 ? " …" : ""}
                {" – "}{t("ergänzen unter Song → Bearbeiten → Rechte & GEMA.")}
              </p>
            </div>
          ) : (
            <p className="text-success">{t("Alle Rechte-Angaben vollständig.")}</p>
          )}
          <Link href="/app/songs" className="inline-block text-accent-text hover:underline">{t("Zu den Songs")}</Link>
        </div>
      )}
    </Card>
  );
}
