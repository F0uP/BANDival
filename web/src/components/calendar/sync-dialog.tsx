"use client";

import { useRef, useState } from "react";
import { AlertCircle, CalendarCheck2, Copy, ExternalLink, FileUp, Link2, RefreshCw, RotateCcw, Shield, Trash2 } from "lucide-react";
import { api, errorMessage, uploadWithProgress } from "@/lib/client/api";
import { cn } from "@/lib/client/cn";
import { formatRelative } from "@/lib/client/format";
import { useCalendarSources, useFeedLink } from "@/lib/client/hooks";
import { useRevalidate } from "@/lib/client/mutations";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/display";
import { Field, Input, Switch } from "@/components/ui/form";
import { Segmented } from "@/components/ui/navigation";
import { useConfirm, useToast } from "@/components/ui/feedback";
import { useSession } from "@/components/providers/session";

type Provider = "google" | "apple" | "outlook" | "file";

const GUIDES: Record<Exclude<Provider, "file">, { label: string; steps: string[]; placeholder: string }> = {
  google: {
    label: "Google",
    steps: [
      "calendar.google.com am Computer öffnen → Zahnrad → Einstellungen.",
      "Links unter „Meine Kalender“ den gewünschten Kalender wählen.",
      "Zu „Kalender integrieren“ scrollen und die „Privatadresse im iCal-Format“ kopieren.",
    ],
    placeholder: "https://calendar.google.com/calendar/ical/…/private-…/basic.ics",
  },
  apple: {
    label: "iCloud",
    steps: [
      "In der Kalender-App (Mac) oder auf icloud.com den Kalender teilen.",
      "„Öffentlicher Kalender“ aktivieren und den webcal://-Link kopieren.",
    ],
    placeholder: "webcal://p…-caldav.icloud.com/published/2/…",
  },
  outlook: {
    label: "Outlook",
    steps: [
      "outlook.com → Einstellungen → Kalender → Freigegebene Kalender.",
      "Unter „Kalender veröffentlichen“ den Kalender und „Kann alle Details anzeigen“ wählen.",
      "Den ICS-Link kopieren.",
    ],
    placeholder: "https://outlook.live.com/owa/calendar/…/calendar.ics",
  },
};

function SourcesSection() {
  const { data, mutate } = useCalendarSources();
  const toast = useToast();
  const confirm = useConfirm();
  const revalidate = useRevalidate();
  const [busy, setBusy] = useState<string | null>(null);
  const sources = data?.sources ?? [];

  const after = async () => {
    await mutate();
    await revalidate("/api/calendar/overview", "/api/events", "/api/calendar/suggestions");
  };

  if (sources.length === 0) return null;

  return (
    <ul className="mb-5 space-y-2">
      {sources.map((source) => (
        <li key={source.id} className="rounded-xl border border-border px-3 py-2.5">
          <div className="flex items-center gap-3">
            <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", source.lastError ? "bg-danger-soft text-danger" : "bg-success-soft text-success")}>
              {source.lastError ? <AlertCircle className="size-4" /> : <CalendarCheck2 className="size-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{source.label}</span>
                {source.kind === "ics_file" ? <Badge>Datei</Badge> : null}
              </div>
              <div className="truncate text-xs text-muted">
                {source.urlHint ? `${source.urlHint} · ` : ""}{source._count.blocks} belegte Zeiten · {source.lastSyncedAt ? `aktualisiert ${formatRelative(source.lastSyncedAt)}` : "noch nicht synchronisiert"}
              </div>
            </div>
            {source.kind === "ics_url" ? (
              <Button
                size="icon-sm"
                variant="ghost"
                loading={busy === source.id}
                aria-label="Jetzt synchronisieren"
                onClick={async () => {
                  setBusy(source.id);
                  try {
                    await api.post(`/api/calendar/sources/${source.id}`);
                    toast.success("Kalender aktualisiert.");
                  } catch (error) {
                    toast.error(errorMessage(error));
                  } finally {
                    setBusy(null);
                    await after();
                  }
                }}
              >
                {busy !== source.id ? <RefreshCw /> : null}
              </Button>
            ) : null}
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Kalender entfernen"
              onClick={async () => {
                const ok = await confirm({ title: `„${source.label}“ trennen?`, description: "Die importierten belegten Zeiten werden entfernt.", confirmLabel: "Trennen", tone: "danger" });
                if (!ok) return;
                await api.delete(`/api/calendar/sources/${source.id}`).catch((error) => toast.error(errorMessage(error)));
                await after();
              }}
            >
              <Trash2 />
            </Button>
          </div>
          {source.lastError ? <p className="mt-2 text-xs text-danger">{source.lastError}</p> : null}
          <div className="mt-1 -mb-1">
            <Switch
              checked={source.enabled}
              onChange={async (enabled) => {
                await api.patch(`/api/calendar/sources/${source.id}`, { enabled }).catch((error) => toast.error(errorMessage(error)));
                await after();
              }}
              label={<span className="text-[13px] font-normal text-muted">Für Verfügbarkeit berücksichtigen</span>}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function ConnectSection() {
  const [provider, setProvider] = useState<Provider>("google");
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const sources = useCalendarSources();
  const revalidate = useRevalidate();

  const done = async (imported: number) => {
    toast.success(`Verbunden – ${imported} belegte Zeiten importiert.`);
    setUrl("");
    setLabel("");
    await sources.mutate();
    await revalidate("/api/calendar/overview", "/api/events", "/api/calendar/suggestions");
  };

  const connect = async () => {
    if (!url.trim()) return;
    setSaving(true);
    try {
      const guide = provider === "file" ? null : GUIDES[provider];
      const result = await api.post<{ imported: number }>("/api/calendar/sources", { label: label.trim() || `${guide?.label ?? "Mein"} Kalender`, url: url.trim() });
      await done(result.imported);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const upload = async (file: File) => {
    setSaving(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("label", label.trim() || file.name.replace(/\.ics$/i, ""));
    try {
      const result = await uploadWithProgress<{ imported: number }>("/api/calendar/sources/upload", formData, () => undefined).promise;
      await done(result.imported);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border p-4">
      <Segmented
        size="sm"
        className="mb-4 w-full"
        value={provider}
        onChange={setProvider}
        items={[
          { value: "google", label: "Google" },
          { value: "apple", label: "iCloud" },
          { value: "outlook", label: "Outlook" },
          { value: "file", label: ".ics-Datei" },
        ]}
      />
      {provider === "file" ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">Einmaliger Import, z. B. aus einem Kalender-Export. Für automatische Aktualisierung lieber einen Link verbinden.</p>
          <Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Name (optional)" />
          <Button icon={<FileUp />} loading={saving} onClick={() => fileRef.current?.click()} className="w-full">.ics-Datei auswählen</Button>
          <input ref={fileRef} type="file" accept=".ics,text/calendar" className="hidden" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
            event.target.value = "";
          }} />
        </div>
      ) : (
        <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void connect(); }}>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
            {GUIDES[provider].steps.map((step) => <li key={step}>{step}</li>)}
          </ol>
          <Field label="Geheime iCal-Adresse">
            {(id) => <Input id={id} value={url} onChange={(event) => setUrl(event.target.value)} placeholder={GUIDES[provider].placeholder} inputMode="url" autoComplete="off" />}
          </Field>
          <Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder={`Name, z. B. „${GUIDES[provider].label} privat“ (optional)`} />
          <Button type="submit" variant="primary" icon={<Link2 />} loading={saving} disabled={!url.trim()} className="w-full">Kalender verbinden</Button>
        </form>
      )}
    </div>
  );
}

function FeedSection() {
  const { bandId, band } = useSession();
  const feed = useFeedLink(bandId);
  const toast = useToast();
  const confirm = useConfirm();

  const copy = async () => {
    if (!feed.data) return;
    try {
      await navigator.clipboard.writeText(feed.data.url);
      toast.success("Link kopiert.");
    } catch {
      toast.error("Kopieren nicht möglich – bitte manuell markieren.");
    }
  };

  const reset = async () => {
    const ok = await confirm({
      title: "Abo-Link zurücksetzen?",
      description: "Der alte Link funktioniert danach nicht mehr – bereits eingerichtete Abos musst du neu hinzufügen.",
      confirmLabel: "Zurücksetzen",
    });
    if (!ok || !bandId) return;
    const result = await api.post<{ url: string; webcalUrl: string }>(`/api/calendar/feed-link?bandId=${bandId}`);
    await feed.mutate(result, { revalidate: false });
    toast.success("Neuer Link erstellt.");
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Alle Proben und Gigs von <strong className="text-fg">{band?.name}</strong> automatisch in deinem Handy- oder Google-Kalender – inklusive Änderungen.
      </p>
      <div className="flex gap-2">
        <Input readOnly value={feed.data?.url ?? "…"} onFocus={(event) => event.currentTarget.select()} className="font-mono text-xs" aria-label="Abo-Link" />
        <Button size="icon" onClick={() => void copy()} aria-label="Link kopieren"><Copy /></Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          icon={<ExternalLink />}
          disabled={!feed.data}
          onClick={() => feed.data && window.open(`https://calendar.google.com/calendar/render?cid=${encodeURIComponent(feed.data.webcalUrl)}`, "_blank")}
        >
          Zu Google Kalender hinzufügen
        </Button>
        <Button size="sm" icon={<CalendarCheck2 />} disabled={!feed.data} onClick={() => feed.data && (window.location.href = feed.data.webcalUrl)}>
          Apple / Outlook abonnieren
        </Button>
        <Button size="sm" variant="ghost" icon={<RotateCcw />} onClick={() => void reset()}>Zurücksetzen</Button>
      </div>
      <p className="text-xs text-muted">Der Link ist persönlich – bitte nicht weitergeben. Google aktualisiert abonnierte Kalender nur alle paar Stunden; dein Server muss dafür öffentlich erreichbar sein.</p>
    </div>
  );
}

export function CalendarSyncDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<"import" | "export">("import");
  return (
    <Dialog open={open} onClose={onClose} title="Kalender-Sync" size="lg">
      <Segmented
        className="mb-5 w-full"
        value={tab}
        onChange={setTab}
        items={[
          { value: "import", label: "Meine Termine blocken" },
          { value: "export", label: "Band-Termine abonnieren" },
        ]}
      />
      {tab === "import" ? (
        <>
          <div className="mb-4 flex items-start gap-2.5 rounded-xl bg-surface-2 px-3.5 py-3 text-sm">
            <Shield className="mt-0.5 size-4 shrink-0 text-accent-text" />
            <p className="text-muted">
              Verbinde deinen privaten Kalender: Belegte Zeiten werden automatisch als <strong className="text-fg">nicht verfügbar</strong> eingetragen und alle 30 Minuten aktualisiert.
              Deine Band sieht nur „belegt“ – keine Titel, keine Details.
            </p>
          </div>
          <SourcesSection />
          <ConnectSection />
        </>
      ) : (
        <FeedSection />
      )}
    </Dialog>
  );
}
