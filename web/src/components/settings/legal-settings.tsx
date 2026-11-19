"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { ExternalLink, RotateCcw, Scale } from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardHeader } from "@/components/ui/display";
import { Switch, Textarea } from "@/components/ui/form";
import { Segmented } from "@/components/ui/navigation";
import { useConfirm, useToast } from "@/components/ui/feedback";
import { useSession } from "@/components/providers/session";
import { CookieSettingsLink } from "@/components/legal/cookie-banner";
import { LegalMarkdown } from "@/components/legal/markdown";
import { formatDateTime } from "@/lib/client/format";
import { t } from "@/lib/i18n";

type Slug = "impressum" | "datenschutz" | "agb";
type LegalPageData = { slug: Slug; content: string; custom: boolean; updatedAt: string | null; template: string };
type LegalData = { pages: LegalPageData[]; cookieBanner: boolean };

const TITLES: Record<Slug, string> = { impressum: "Impressum", datenschutz: "Datenschutzerklärung", agb: "AGB" };

/**
 * Legal pages of this instance. Everybody gets the links; instance administrators can edit the texts
 * (Markdown) – until then the generated German templates are shown.
 */
export function LegalSettings() {
  const { me } = useSession();
  return (
    <Card>
      <CardHeader
        title={t("Rechtliches")}
        icon={<Scale />}
        description={me?.instanceAdmin ? t("Impressum, Datenschutzerklärung und AGB dieser Instanz – du kannst sie als Administration bearbeiten.") : t("Impressum, Datenschutzerklärung und AGB dieser Instanz.")}
      />
      <div className="flex flex-wrap gap-2">
        {(Object.keys(TITLES) as Slug[]).map((slug) => (
          <Link key={slug} href={`/${slug}`} target="_blank" className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border px-3.5 text-[13px] text-muted transition-colors hover:border-fg/25 hover:text-fg">
            {t(TITLES[slug])} <ExternalLink className="size-3.5" />
          </Link>
        ))}
        <CookieSettingsLink className="inline-flex h-8 items-center rounded-full border border-border px-3.5 text-[13px] text-muted transition-colors hover:border-fg/25 hover:text-fg" />
      </div>
      {me?.instanceAdmin ? <LegalEditor /> : null}
    </Card>
  );
}

function LegalEditor() {
  const toast = useToast();
  const confirm = useConfirm();
  const { data, mutate } = useSWR<LegalData>("/api/admin/legal");
  const [slug, setSlug] = useState<Slug>("impressum");
  const [drafts, setDrafts] = useState<Partial<Record<Slug, string>>>({});
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!data) return <div className="mt-6 h-64 animate-pulse rounded-xl bg-surface-2" />;
  const page = data.pages.find((entry) => entry.slug === slug)!;
  const value = drafts[slug] ?? page.content;
  const dirty = drafts[slug] !== undefined && drafts[slug] !== page.content;
  const placeholders = (value.match(/\[[^\]\n]{3,}\]/g) ?? []).filter((match) => !/^\[[^\]]+\]\(/.test(match)).length;

  const save = async (content: string | null) => {
    setSaving(true);
    try {
      const next = await api.put<LegalData>("/api/admin/legal", { slug, content });
      await mutate(next, { revalidate: false });
      setDrafts((current) => ({ ...current, [slug]: undefined }));
      toast.success(content === null ? t("Auf Vorlage zurückgesetzt.") : t("Gespeichert."));
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    const ok = await confirm({
      title: t("Auf Vorlage zurücksetzen?"),
      description: t("Deine Änderungen an „{title}“ werden verworfen und die automatisch erzeugte Vorlage wird wieder angezeigt.", { title: t(TITLES[slug]) }),
      confirmLabel: t("Zurücksetzen"),
      tone: "danger",
    });
    if (ok) await save(null);
  };

  const toggleBanner = async (enabled: boolean) => {
    try {
      await mutate(await api.put<LegalData>("/api/admin/legal", { cookieBanner: enabled }), { revalidate: false });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <div className="mt-6 border-t border-border pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={slug}
          onChange={(next) => { setSlug(next); setPreview(false); }}
          items={(Object.keys(TITLES) as Slug[]).map((key) => ({ value: key, label: t(TITLES[key]) }))}
        />
        <div className="flex items-center gap-2">
          {page.custom ? <Badge tone="success" dot>{t("Angepasst")}</Badge> : <Badge tone="warning" dot>{t("Vorlage")}</Badge>}
          <Button size="sm" variant="ghost" onClick={() => setPreview((current) => !current)}>{preview ? t("Bearbeiten") : t("Vorschau")}</Button>
        </div>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-muted">
        {t("Vorlagen sind keine Rechtsberatung. Ersetze die Platzhalter in [eckigen Klammern] und lass die Texte im Zweifel prüfen. Formatierung: # Überschrift, ## Abschnitt, - Liste, **fett**, [Linktext](https://…).")}
      </p>
      {placeholders > 0 ? (
        <p className="mt-2 text-xs font-medium text-warning">{t("Noch {count} Platzhalter offen.", { count: placeholders })}</p>
      ) : null}

      <div className="mt-3">
        {preview ? (
          <div className="max-h-[32rem] overflow-y-auto rounded-xl border border-border bg-bg px-5 py-4">
            <LegalMarkdown source={value} />
          </div>
        ) : (
          <Textarea
            aria-label={t(TITLES[slug])}
            value={value}
            onChange={(event) => setDrafts((current) => ({ ...current, [slug]: event.target.value }))}
            rows={18}
            spellCheck
            className="font-mono text-[12.5px] leading-relaxed"
          />
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-subtle">
          {page.updatedAt ? t("Zuletzt gespeichert {date}", { date: formatDateTime(page.updatedAt) }) : t("Wird aus der Server-Konfiguration erzeugt, bis du speicherst.")}
        </span>
        <div className="flex gap-2">
          {page.custom ? <Button size="sm" variant="ghost" icon={<RotateCcw />} onClick={() => void reset()} disabled={saving}>{t("Vorlage")}</Button> : null}
          <Button size="sm" variant="primary" onClick={() => void save(value)} disabled={saving || (!dirty && page.custom)}>
            {page.custom || dirty ? t("Speichern") : t("Vorlage übernehmen")}
          </Button>
        </div>
      </div>

      <div className="mt-5 border-t border-border pt-3">
        <Switch
          checked={data.cookieBanner}
          onChange={(enabled) => void toggleBanner(enabled)}
          label={t("Cookie-Hinweis anzeigen")}
          description={t("Fragt beim ersten Besuch, ob externe Player (Spotify, YouTube) geladen werden dürfen. Ohne Hinweis werden sie nur nach Klick geladen.")}
        />
      </div>
    </div>
  );
}
