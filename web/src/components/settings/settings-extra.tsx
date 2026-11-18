"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { BellRing, Copy, Download, MailWarning, Send, ShieldCheck, ShieldOff, Smartphone } from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import { formatBytes, formatDate, formatRelative } from "@/lib/client/format";
import { disablePush, enablePush, getPushState, type PushState } from "@/lib/client/push";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/form";
import { useConfirm, useToast } from "@/components/ui/feedback";
import { useSession } from "@/components/providers/session";

/** Banner asking the user to confirm their e-mail address. */
export function EmailVerificationNotice() {
  const { me } = useSession();
  const [sending, setSending] = useState(false);
  const toast = useToast();
  if (!me || me.emailVerified) return null;

  const resend = async () => {
    setSending(true);
    try {
      await api.post("/api/account/verify-email");
      toast.success(`Bestätigungslink an ${me.email} gesendet.`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <span className="flex items-start gap-2.5">
        <MailWarning className="mt-0.5 size-4 shrink-0 text-warning" />
        <span>Bitte bestätige deine E-Mail-Adresse, damit du dein Passwort zurücksetzen und Mails empfangen kannst.</span>
      </span>
      <Button size="sm" loading={sending} onClick={() => void resend()}>Link erneut senden</Button>
    </div>
  );
}

const PUSH_LABEL: Record<PushState, string> = {
  unsupported: "Nicht unterstützt",
  denied: "Blockiert",
  enabled: "Aktiv",
  disabled: "Aus",
};

/** Web Push for this browser + ntfy topic for the Android app / ntfy clients. */
export function PushDevices() {
  const { me, refresh } = useSession();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [ntfy, setNtfy] = useState<string | null>(null);
  const [savingNtfy, setSavingNtfy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    getPushState().then((value) => !cancelled && setState(value)).catch(() => !cancelled && setState("unsupported"));
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = async () => {
    setBusy(true);
    try {
      const next = state === "enabled" ? await disablePush() : await enablePush();
      setState(next);
      if (next === "denied") toast.error("Benachrichtigungen sind im Browser blockiert. Erlaube sie in den Website-Einstellungen.");
      if (next === "enabled") toast.success("Push ist auf diesem Gerät aktiv.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    try {
      await api.post("/api/push/test");
      toast.success("Test-Benachrichtigung verschickt.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const ntfyValue = ntfy ?? me?.ntfyTopicUrl ?? "";
  const saveNtfy = async () => {
    setSavingNtfy(true);
    try {
      await api.patch("/api/account/profile", { ntfyTopicUrl: ntfyValue.trim() });
      await refresh();
      setNtfy(null);
      toast.success(ntfyValue.trim() ? "ntfy-Topic gespeichert." : "ntfy deaktiviert.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSavingNtfy(false);
    }
  };

  const suggestTopic = () => {
    const random = crypto.getRandomValues(new Uint8Array(9));
    const slug = Array.from(random, (byte) => byte.toString(36).padStart(2, "0")).join("").slice(0, 16);
    setNtfy(`https://ntfy.sh/bandival-${slug}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-border p-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-text"><BellRing className="size-4" /></span>
          <div>
            <p className="text-sm font-medium">Push auf diesem Gerät <Badge tone={state === "enabled" ? "success" : "neutral"} className="ml-1">{state ? PUSH_LABEL[state] : "…"}</Badge></p>
            <p className="text-xs text-muted">
              {state === "unsupported"
                ? "Dieser Browser unterstützt kein Web Push (auf iOS: erst „Zum Home-Bildschirm“ hinzufügen)."
                : "Erinnerungen, Zusage-Nachfragen und Neuigkeiten – auch wenn Bandival geschlossen ist."}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {state === "enabled" ? <Button size="sm" variant="ghost" icon={<Send />} onClick={() => void test()}>Test</Button> : null}
          <Button size="sm" variant={state === "enabled" ? "secondary" : "primary"} loading={busy} disabled={state === "unsupported" || state === "denied" || state === null} onClick={() => void toggle()}>
            {state === "enabled" ? "Deaktivieren" : "Aktivieren"}
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border p-3.5">
        <div className="mb-3 flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted"><Smartphone className="size-4" /></span>
          <div>
            <p className="text-sm font-medium">ntfy (Android-App & ohne Google-Dienste)</p>
            <p className="text-xs text-muted">Abonniere dasselbe Topic in der ntfy-App – Bandival schickt dir dorthin alle Benachrichtigungen. Das Topic wirkt wie ein Passwort.</p>
          </div>
        </div>
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); void saveNtfy(); }}>
          <Input value={ntfyValue} onChange={(event) => setNtfy(event.target.value)} placeholder="https://ntfy.sh/bandival-…" aria-label="ntfy-Topic-URL" className="font-mono text-xs" />
          <div className="flex gap-2">
            {!ntfyValue ? <Button type="button" variant="ghost" onClick={suggestTopic}>Vorschlag</Button> : null}
            <Button type="submit" loading={savingNtfy} disabled={ntfyValue === (me?.ntfyTopicUrl ?? "")}>Speichern</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

type TwoFactorStatus = { enabled: boolean; remainingRecoveryCodes: number };
type SetupData = { secret: string; otpauthUrl: string; qrSvg: string };

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const toast = useToast();
  const text = codes.join("\n");
  return (
    <div className="space-y-3 rounded-xl border border-warning/30 bg-warning-soft p-4">
      <p className="text-sm font-medium">Wiederherstellungscodes – jetzt sicher aufbewahren!</p>
      <p className="text-xs text-muted">Jeder Code funktioniert genau einmal, falls du keinen Zugriff auf deine Authenticator-App hast. Sie werden nur jetzt angezeigt.</p>
      <ul className="grid grid-cols-2 gap-1.5 font-mono text-sm">
        {codes.map((code) => <li key={code} className="rounded-lg bg-surface px-2 py-1 text-center">{code}</li>)}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon={<Copy />} onClick={() => void navigator.clipboard.writeText(text).then(() => toast.success("Kopiert."))}>Kopieren</Button>
        <Button size="sm" icon={<Download />} onClick={() => {
          const url = URL.createObjectURL(new Blob([`Bandival Wiederherstellungscodes\n\n${text}\n`], { type: "text/plain" }));
          const link = document.createElement("a");
          link.href = url;
          link.download = "bandival-recovery-codes.txt";
          link.click();
          URL.revokeObjectURL(url);
        }}>Als Datei</Button>
        <Button size="sm" variant="primary" onClick={onDone}>Gespeichert</Button>
      </div>
    </div>
  );
}

/** TOTP two-factor authentication (Google Authenticator, Aegis, 1Password, …). */
export function TwoFactorSettings() {
  const { data, mutate } = useSWR<TwoFactorStatus>("/api/account/2fa", (url: string) => api.get<TwoFactorStatus>(url));
  const { refresh } = useSession();
  const [setup, setSetup] = useState<SetupData | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  const start = async () => {
    setBusy(true);
    try {
      setSetup(await api.post<SetupData>("/api/account/2fa", { action: "setup" }));
      setCode("");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const enable = async () => {
    setBusy(true);
    try {
      const result = await api.post<{ recoveryCodes: string[] }>("/api/account/2fa", { action: "enable", code });
      setCodes(result.recoveryCodes);
      setSetup(null);
      await Promise.all([mutate(), refresh()]);
      toast.success("Zwei-Faktor-Anmeldung ist aktiv.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const withPassword = async (action: "disable" | "recovery-codes") => {
    const password = await confirm({
      title: action === "disable" ? "Zwei-Faktor-Anmeldung deaktivieren?" : "Neue Wiederherstellungscodes erzeugen?",
      description: action === "disable" ? "Dein Account ist dann nur noch durch das Passwort geschützt." : "Alle bisherigen Codes werden ungültig.",
      confirmLabel: action === "disable" ? "Deaktivieren" : "Neue Codes",
      tone: action === "disable" ? "danger" : undefined,
      input: { label: "Passwort zur Bestätigung", type: "password" },
    });
    if (typeof password !== "string") return;
    try {
      const result = await api.post<{ recoveryCodes?: string[] }>("/api/account/2fa", { action, password });
      if (result.recoveryCodes) setCodes(result.recoveryCodes);
      await Promise.all([mutate(), refresh()]);
      if (action === "disable") toast.success("Zwei-Faktor-Anmeldung deaktiviert.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted">
            {data?.enabled ? <ShieldCheck className="size-4 text-success" /> : <ShieldOff className="size-4" />}
          </span>
          <div>
            <p className="text-sm font-medium">Zwei-Faktor-Anmeldung {data?.enabled ? <Badge tone="success" className="ml-1">Aktiv</Badge> : null}</p>
            <p className="text-xs text-muted">
              {data?.enabled
                ? `Noch ${data.remainingRecoveryCodes} unbenutzte Wiederherstellungscodes.`
                : "Zusätzlich zum Passwort ein Code aus einer Authenticator-App."}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {data?.enabled ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => void withPassword("recovery-codes")}>Neue Codes</Button>
              <Button size="sm" variant="outline-danger" onClick={() => void withPassword("disable")}>Deaktivieren</Button>
            </>
          ) : !setup ? (
            <Button size="sm" variant="primary" loading={busy} onClick={() => void start()}>Einrichten</Button>
          ) : null}
        </div>
      </div>

      {setup ? (
        <div className="grid gap-4 rounded-xl border border-border p-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(setup.qrSvg)}`}
            alt="QR-Code für die Authenticator-App"
            className="mx-auto size-40 rounded-xl bg-white p-1.5"
          />
          <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void enable(); }}>
            <p className="text-sm">1. Scanne den QR-Code mit deiner Authenticator-App.</p>
            <p className="text-xs text-muted">Oder gib den Schlüssel manuell ein: <code className="break-all rounded bg-surface-2 px-1 py-0.5 font-mono">{setup.secret}</code></p>
            <Field label="2. Angezeigten Code eingeben">
              {(id) => (
                <Input id={id} value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" placeholder="123456" className="font-mono tracking-[0.3em]" required />
              )}
            </Field>
            <div className="flex gap-2">
              <Button type="submit" variant="primary" loading={busy} disabled={code.trim().length < 6}>Aktivieren</Button>
              <Button type="button" variant="ghost" onClick={() => setSetup(null)}>Abbrechen</Button>
            </div>
          </form>
        </div>
      ) : null}

      {codes ? <RecoveryCodes codes={codes} onDone={() => setCodes(null)} /> : null}
    </div>
  );
}

type BackupList = { backups: Array<{ name: string; size: number; createdAt: string }>; enabled: boolean; retentionDays: number };

/** Nightly server-side backups. */
export function AutomaticBackups({ bandId }: { bandId: string }) {
  const { data } = useSWR<BackupList>(`/api/bands/${bandId}/backups`, (url: string) => api.get<BackupList>(url));
  if (!data) return null;
  return (
    <div className="mt-6 border-t border-border pt-5">
      <p className="text-sm font-medium">Automatische Backups</p>
      <p className="mb-3 text-xs text-muted">
        {data.enabled
          ? `Jede Nacht gegen 3 Uhr, ${data.retentionDays} Tage aufbewahrt (Server-Ordner BACKUP_DIR).`
          : "Auf diesem Server deaktiviert (BACKUP_ENABLED=false)."}
      </p>
      {data.backups.length === 0 ? (
        <p className="text-sm text-subtle">Noch keine automatischen Backups vorhanden.</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {data.backups.slice(0, 14).map((backup) => (
            <li key={backup.name} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm">
              <span>
                {formatDate(`${backup.name.replace(".json", "")}T12:00:00`)}
                <span className="ml-2 text-xs text-muted">{formatBytes(backup.size)} · {formatRelative(backup.createdAt)}</span>
              </span>
              <a className="text-sm font-medium text-accent-text hover:underline" href={`/api/bands/${bandId}/backups/${backup.name}`} download>
                Herunterladen
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
