"use client";

import useSWR from "swr";
import { useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useSWRConfig } from "swr";
import { Bell, Database, Download, Globe, ImageUp, KeyRound, LogOut, Monitor, Moon, Palette, Server, Smartphone, Sun, Trash2, Upload, User, Users, Vibrate } from "lucide-react";
import { api, errorMessage, uploadWithProgress } from "@/lib/client/api";
import { cn } from "@/lib/client/cn";
import { useBandDetails, useMembers, useNotificationPreferences } from "@/lib/client/hooks";
import { setThemeMode, THEME_LABEL, useThemeMode, type ThemeMode } from "@/lib/client/theme";
import type { NotificationPreference } from "@/lib/client/types";
import { Button } from "@/components/ui/button";
import { Avatar, Card, CardHeader, PageHeader } from "@/components/ui/display";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/form";
import { useConfirm, useToast } from "@/components/ui/feedback";
import { useSession } from "@/components/providers/session";
import { AutomaticBackups, EmailVerificationNotice, PushDevices, TwoFactorSettings } from "@/components/settings/settings-extra";
import { PasskeysCard } from "@/components/settings/passkeys-card";
import { PasswordChecklist } from "@/components/auth/password-checklist";
import { passwordProblems } from "@/lib/password-policy";
import { PublicPageSettings } from "@/components/settings/public-page-settings";
import { PulsePanel } from "@/components/live/pulse-panel";

type AndroidBridge = { changeServer?: () => void; getAppVersion?: () => string };

function getAndroid(): AndroidBridge | null {
  return (window as unknown as { BandivalAndroid?: AndroidBridge }).BandivalAndroid ?? null;
}

const SECTIONS = [
  { id: "profile", label: "Profil", icon: User },
  { id: "appearance", label: "Darstellung", icon: Palette },
  { id: "notifications", label: "Benachrichtigungen", icon: Bell },
  { id: "band", label: "Band", icon: Users },
  { id: "public", label: "Bandseite", icon: Globe },
  { id: "devices", label: "Geräte", icon: Vibrate },
  { id: "data", label: "Backup", icon: Database },
  { id: "security", label: "Sicherheit", icon: KeyRound },
];

function Section({ id, children }: { id: string; children: ReactNode }) {
  return <div id={id} className="scroll-mt-24">{children}</div>;
}

function ProfileSection() {
  const { me, band, bandId, refresh } = useSession();
  const members = useMembers(bandId);
  const myMember = members.data?.members.find((member) => member.userId === me?.userId);
  const [name, setName] = useState(me?.displayName ?? "");
  const [instrument, setInstrument] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const { mutate } = useSWRConfig();

  const instrumentValue = instrument ?? myMember?.instrumentPrimary ?? "";

  const save = async () => {
    if (!bandId || !name.trim()) return;
    setSaving(true);
    try {
      await api.patch(`/api/bands/${bandId}/members/me`, { displayName: name.trim(), instrumentPrimary: instrumentValue.trim() || null });
      await Promise.all([refresh(), members.mutate()]);
      toast.success("Profil gespeichert.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const uploadAvatar = async (file: File) => {
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      await uploadWithProgress("/api/account/avatar", formData, () => undefined).promise;
      await refresh();
      await mutate((key) => typeof key === "string" && key.includes("/members"));
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setUploading(false);
    }
  };

  const removeAvatar = async () => {
    await api.delete("/api/account/avatar").catch((error) => toast.error(errorMessage(error)));
    await refresh();
  };

  return (
    <Card>
      <CardHeader title="Profil" description="So sieht dich deine Band." />
      <div className="mb-5 flex items-center gap-4">
        <Avatar name={me?.displayName} src={me?.avatarUrl} size="xl" />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon={<ImageUp />} loading={uploading} onClick={() => fileRef.current?.click()}>Foto hochladen</Button>
          {me?.avatarUrl ? <Button size="sm" variant="ghost" onClick={() => void removeAvatar()}>Entfernen</Button> : null}
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void uploadAvatar(file);
            event.target.value = "";
          }} />
        </div>
      </div>
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">{(id) => <Input id={id} value={name} onChange={(event) => setName(event.target.value)} required />}</Field>
          <Field label={`Instrument in ${band?.name ?? "der Band"}`}>
            {(id) => <Input id={id} value={instrumentValue} onChange={(event) => setInstrument(event.target.value)} placeholder="z. B. Gitarre & Backing Vocals" />}
          </Field>
        </div>
        <Field label="E-Mail" hint="Die E-Mail-Adresse ist dein Login.">{(id) => <Input id={id} value={me?.email ?? ""} disabled />}</Field>
        <div className="flex justify-end"><Button type="submit" variant="primary" loading={saving}>Speichern</Button></div>
      </form>
    </Card>
  );
}

function AppearanceSection() {
  const mode = useThemeMode();
  const options: Array<{ value: ThemeMode; icon: ReactNode }> = [
    { value: "system", icon: <Monitor /> },
    { value: "light", icon: <Sun /> },
    { value: "dark", icon: <Moon /> },
  ];
  return (
    <Card>
      <CardHeader title="Darstellung" />
      <div className="grid grid-cols-3 gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setThemeMode(option.value)}
            className={cn(
              "flex flex-col items-center gap-2 rounded-xl border px-3 py-4 text-sm font-medium transition-colors [&_svg]:size-5",
              mode === option.value ? "border-accent bg-accent-soft text-accent-text" : "border-border text-muted hover:border-border-strong hover:text-fg",
            )}
          >
            {option.icon}
            {THEME_LABEL[option.value]}
          </button>
        ))}
      </div>
    </Card>
  );
}

function NotificationsSection() {
  const { bandId, band } = useSession();
  const { data, mutate } = useNotificationPreferences(bandId);
  const toast = useToast();
  const preference = data?.preference;

  const update = async (patch: Partial<NotificationPreference>) => {
    if (!bandId || !preference) return;
    await mutate({ preference: { ...preference, ...patch }, emailAvailable: data?.emailAvailable ?? false }, { revalidate: false });
    try {
      await api.patch(`/api/bands/${bandId}/notification-preferences`, patch);
    } catch (error) {
      toast.error(errorMessage(error));
      await mutate();
    }
  };

  return (
    <Card>
      <CardHeader title="Benachrichtigungen" description={`Für ${band?.name ?? "diese Band"}`} />
      {!preference ? <p className="text-sm text-muted">Lädt …</p> : (
        <div className="divide-y divide-border">
          <div className="pb-4"><PushDevices /></div>
          <Switch checked={preference.inAppEnabled} onChange={(value) => void update({ inAppEnabled: value })} label="In der App" description="Glocke oben rechts" />
          <Switch checked={preference.pushEnabled} onChange={(value) => void update({ pushEnabled: value })} label="Push & ntfy" description="Auf allen Geräten, auf denen du Push aktiviert hast" />
          <Switch
            checked={preference.emailEnabled}
            disabled={!data?.emailAvailable}
            onChange={(value) => void update({ emailEnabled: value })}
            label="Per E-Mail"
            description={data?.emailAvailable ? "Zusätzlich eine Mail bei neuen Ereignissen" : "Auf diesem Server ist kein Mailversand eingerichtet (SMTP)."}
          />
          <div className="py-2 text-xs font-medium uppercase tracking-wider text-muted">Worüber?</div>
          <Switch checked={preference.notifyEvents} onChange={(value) => void update({ notifyEvents: value })} label="Termine" description="Neue, verschobene oder abgesagte Proben & Gigs" />
          <Switch checked={preference.notifySongs} onChange={(value) => void update({ notifySongs: value })} label="Songs & Diskussionen" />
          <Switch checked={preference.notifySetlists} onChange={(value) => void update({ notifySetlists: value })} label="Setlists" />
          <Switch checked={preference.notifyInvites} onChange={(value) => void update({ notifyInvites: value })} label="Neue Mitglieder" />
          <div className="py-2 text-xs font-medium uppercase tracking-wider text-muted">Automatisch</div>
          <Switch checked={preference.remindersEnabled} onChange={(value) => void update({ remindersEnabled: value })} label="Erinnerungen" description="24 h vor Proben & Gigs – und eine Nachfrage, wenn du noch nicht zugesagt hast" />
          <Switch
            checked={preference.digestEnabled}
            disabled={!data?.emailAvailable}
            onChange={(value) => void update({ digestEnabled: value })}
            label="Wochenüberblick per Mail"
            description="Montags: Termine der Woche, offene Aufgaben, neue Songs"
          />
        </div>
      )}
    </Card>
  );
}

const TIME_ZONES: string[] = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone") ?? ["Europe/Berlin"];
  } catch {
    return ["Europe/Berlin"];
  }
})();

function BandSection() {
  const { bandId, band, can, refresh, setBandId, me } = useSession();
  const details = useBandDetails(bandId);
  const [name, setName] = useState<string | null>(null);
  const [description, setDescription] = useState<string | null>(null);
  const [timezone, setTimezone] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const zones = TIME_ZONES;

  const current = details.data?.band;
  const manage = can("band.manage");

  const save = async () => {
    if (!bandId) return;
    setSaving(true);
    try {
      await api.patch(`/api/bands/${bandId}`, {
        name: (name ?? current?.name ?? "").trim(),
        description: (description ?? current?.description ?? "").trim() || null,
        timezone: timezone ?? current?.timezone,
      });
      await Promise.all([refresh(), details.mutate()]);
      toast.success("Band gespeichert.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const leave = async () => {
    if (!bandId) return;
    const ok = await confirm({ title: `${band?.name} verlassen?`, description: "Du verlierst den Zugriff auf Songs, Setlists und Termine dieser Band.", confirmLabel: "Band verlassen", tone: "danger" });
    if (!ok) return;
    try {
      await api.post("/api/account/leave-band", { bandId });
      const remaining = me?.bands.filter((entry) => entry.id !== bandId) ?? [];
      if (remaining[0]) setBandId(remaining[0].id);
      await refresh();
      await mutate(() => true);
      router.push("/app");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const deleteBand = async () => {
    if (!bandId || !band) return;
    const typed = await confirm({
      title: `${band.name} endgültig löschen?`,
      description: "Alle Songs, Aufnahmen, Setlists und Termine werden unwiderruflich gelöscht. Gib zur Bestätigung den Bandnamen ein.",
      confirmLabel: "Band löschen",
      tone: "danger",
      input: { placeholder: band.name },
    });
    if (typeof typed !== "string") return;
    try {
      await api.delete(`/api/bands/${bandId}`, { confirmName: typed });
      const remaining = me?.bands.filter((entry) => entry.id !== bandId) ?? [];
      if (remaining[0]) setBandId(remaining[0].id);
      await refresh();
      await mutate(() => true);
      router.push("/app");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <Card>
      <CardHeader title="Band" description={current ? `${current.stats.members} Mitglieder · ${current.stats.songs} Songs · ${current.stats.setlists} Setlists` : undefined} />
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <Field label="Bandname">{(id) => <Input id={id} disabled={!manage} value={name ?? current?.name ?? ""} onChange={(event) => setName(event.target.value)} />}</Field>
        <Field label="Beschreibung" optional>
          {(id) => <Textarea id={id} rows={2} disabled={!manage} value={description ?? current?.description ?? ""} onChange={(event) => setDescription(event.target.value)} placeholder="Genre, Stadt, Besetzung …" />}
        </Field>
        <Field label="Zeitzone" hint="Für Kalender-Abos, Terminfinder und E-Mails.">
          {(id) => (
            <Select id={id} disabled={!manage} value={timezone ?? current?.timezone ?? "Europe/Berlin"} onChange={(event) => setTimezone(event.target.value)}>
              {zones.map((zone) => <option key={zone} value={zone}>{zone.replaceAll("_", " ")}</option>)}
            </Select>
          )}
        </Field>
        {manage ? <div className="flex justify-end"><Button type="submit" variant="primary" loading={saving}>Speichern</Button></div> : null}
      </form>
      <div className="mt-6 space-y-3 border-t border-border pt-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">Band verlassen</p>
            <p className="text-xs text-muted">Du kannst jederzeit wieder eingeladen werden.</p>
          </div>
          <Button variant="outline-danger" icon={<LogOut />} onClick={() => void leave()}>Verlassen</Button>
        </div>
        {band?.role === "owner" ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-danger">Band löschen</p>
              <p className="text-xs text-muted">Löscht alle Daten dieser Band unwiderruflich.</p>
            </div>
            <Button variant="danger" icon={<Trash2 />} onClick={() => void deleteBand()}>Löschen</Button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function DataSection() {
  const { bandId, band, can } = useSession();
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const confirm = useConfirm();
  const { mutate } = useSWRConfig();

  if (!can("backup.export")) {
    return (
      <Card>
        <CardHeader title="Backup" />
        <p className="text-sm text-muted">Backups können Owner und Admins erstellen.</p>
      </Card>
    );
  }

  const importBackup = async (file: File) => {
    if (!bandId) return;
    const ok = await confirm({
      title: "Backup wiederherstellen?",
      description: `Alle aktuellen Songs, Setlists und Termine von ${band?.name} werden durch den Stand des Backups ersetzt.`,
      confirmLabel: "Wiederherstellen",
      tone: "danger",
    });
    if (!ok) return;
    setImporting(true);
    try {
      const payload = JSON.parse(await file.text()) as unknown;
      await api.post(`/api/bands/${bandId}/backup`, payload);
      await mutate(() => true);
      toast.success("Backup wiederhergestellt.");
    } catch (error) {
      toast.error(error instanceof SyntaxError ? "Die Datei ist kein gültiges JSON." : errorMessage(error));
    } finally {
      setImporting(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Backup" description="Songs, Setlists, Termine & Diskussionen als JSON. Audio-Dateien liegen im Upload-Volume des Servers." />
      <div className="flex flex-wrap gap-2">
        <Button icon={<Download />} onClick={() => window.open(`/api/bands/${bandId}/backup`, "_blank")}>Backup jetzt herunterladen</Button>
        {can("backup.restore") ? (
          <>
            <Button variant="outline-danger" icon={<Upload />} loading={importing} onClick={() => fileRef.current?.click()}>Backup einspielen</Button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importBackup(file);
              event.target.value = "";
            }} />
          </>
        ) : null}
      </div>
      {bandId ? <AutomaticBackups bandId={bandId} /> : null}
    </Card>
  );
}

function SecuritySection() {
  const { me } = useSession();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();
  const account = useSWR<{ hasPassword: boolean }>("/api/account/passkeys");
  const hasPassword = account.data?.hasPassword ?? true;
  const policyContext = { email: me?.email, name: me?.displayName };

  const save = async () => {
    setSaving(true);
    try {
      await api.patch("/api/account/password", { currentPassword: current, newPassword: next });
      setCurrent("");
      setNext("");
      await account.mutate();
      toast.success(hasPassword ? "Passwort geändert. Andere Geräte wurden abgemeldet." : "Passwort gesetzt – du kannst dich jetzt auch damit anmelden.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const deleteAccount = async () => {
    const password = await confirm({
      title: "Account löschen?",
      description: "Dein Account wird endgültig gelöscht. Bands, in denen du alleine bist, werden mitgelöscht.",
      confirmLabel: "Account löschen",
      tone: "danger",
      input: hasPassword ? { label: "Passwort zur Bestätigung", type: "password" } : { label: "Deine E-Mail-Adresse zur Bestätigung", type: "email" },
    });
    if (typeof password !== "string") return;
    try {
      await api.delete("/api/account/delete", { password });
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload clears all client state after deleting the account
      window.location.href = "/";
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <Card>
      <CardHeader title="Sicherheit" />
      <div className="mb-6 border-b border-border pb-6"><PasskeysCard /></div>
      <div className="mb-6 border-b border-border pb-6"><TwoFactorSettings /></div>
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <p className="text-sm font-medium">{hasPassword ? "Passwort ändern" : "Passwort festlegen (optional)"}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {hasPassword ? <Field label="Aktuelles Passwort">{(id) => <Input id={id} type="password" autoComplete="current-password" value={current} onChange={(event) => setCurrent(event.target.value)} required />}</Field> : null}
          <Field label="Neues Passwort">{(id) => <Input id={id} type="password" autoComplete="new-password" minLength={12} maxLength={256} value={next} onChange={(event) => setNext(event.target.value)} required />}</Field>
        </div>
        {next ? <PasswordChecklist password={next} context={policyContext} /> : null}
        <div className="flex justify-end"><Button type="submit" variant="primary" loading={saving} disabled={(hasPassword && !current) || passwordProblems(next, policyContext).length > 0}>{hasPassword ? "Passwort ändern" : "Passwort festlegen"}</Button></div>
      </form>
      <div className="mt-6 flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-danger">Account löschen</p>
          <p className="text-xs text-muted">Entfernt dein Profil und alle Mitgliedschaften.</p>
        </div>
        <Button variant="danger" icon={<Trash2 />} onClick={() => void deleteAccount()}>Account löschen</Button>
      </div>
    </Card>
  );
}

function AndroidSection() {
  const android = useSyncExternalStore(() => () => undefined, () => Boolean(getAndroid()), () => false);
  if (!android) return null;
  return (
    <Card>
      <CardHeader title="Android-App" icon={<Smartphone />} description={`Version ${getAndroid()?.getAppVersion?.() ?? "?"}`} />
      <Button icon={<Server />} onClick={() => getAndroid()?.changeServer?.()}>Server wechseln</Button>
    </Card>
  );
}

export function SettingsView() {
  const { logout, band } = useSession();
  return (
    <>
      <PageHeader title="Einstellungen" actions={<Button variant="ghost" icon={<LogOut />} onClick={() => void logout()}>Abmelden</Button>} />
      <div className="grid gap-8 lg:grid-cols-[12rem_minmax(0,1fr)]">
        <nav className="hidden lg:block">
          <ul className="sticky top-24 space-y-0.5">
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-fg">
                  <section.icon className="size-4" />{section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="max-w-2xl space-y-6">
          <EmailVerificationNotice />
          <Section id="profile"><ProfileSection /></Section>
          <AndroidSection />
          <Section id="appearance"><AppearanceSection /></Section>
          <Section id="notifications"><NotificationsSection /></Section>
          <Section id="band"><BandSection /></Section>
          {band?.role !== "guest" ? <Section id="public"><PublicPageSettings /></Section> : null}
          <Section id="devices">
            <Card>
              <CardHeader title="Geräte & Bühnen-Funk" description="Fühlbares Metronom: Handy-Vibration, Simulator und das kommende Bandival-Pulse-Armband." />
              <PulsePanel />
            </Card>
          </Section>
          <Section id="data"><DataSection /></Section>
          <Section id="security"><SecuritySection /></Section>
        </div>
      </div>
    </>
  );
}
