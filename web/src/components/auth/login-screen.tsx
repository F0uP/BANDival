"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarDays, Eye, EyeOff, Fingerprint, KeyRound, ListMusic, MailCheck, Music2, ShieldCheck, Users, Vibrate } from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import { cn } from "@/lib/client/cn";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/form";
import { Segmented } from "@/components/ui/navigation";
import { PasswordChecklist } from "@/components/auth/password-checklist";
import { passkeyErrorMessage, passkeysSupported, signInWithPasskey, signUpWithPasskey } from "@/lib/client/passkeys";
import { passwordProblems } from "@/lib/password-policy";
import { t, translatable } from "@/lib/i18n";
import { LanguageSwitch } from "@/components/i18n/language-switch";
import { LegalLinks } from "@/components/legal/legal-links";

type Mode = "login" | "register" | "forgot" | "twofactor";
type InvitePreview = { valid: boolean; bandName?: string; email?: string; invitedBy?: string };
type InstanceConfig = { registrationMode: "open" | "invite" | "closed"; mailConfigured: boolean };

function safeNext(value: string | null): string {
  return value && value.startsWith("/app") && !value.startsWith("//") ? value : "/app";
}

function extractInviteToken(next: string): string | null {
  try {
    const url = new URL(next, "http://local");
    return url.searchParams.get("inviteToken") ?? url.searchParams.get("token");
  } catch {
    return null;
  }
}


const FEATURES = translatable([
  { icon: Music2, text: "Songs, Lead Sheets, Noteneditor & Aufnahmen" },
  { icon: ListMusic, text: "Setlists & Live-Modus mit synchronem Click" },
  { icon: CalendarDays, text: "Proben planen – Kalender-Sync, Terminfinder, Protokoll" },
  { icon: Users, text: "Rollen, Gäste, Bandkasse & öffentliche Bandseite" },
]);

/** A row of thin bars moving like a level meter – the quiet pulse of the login stage. */
function LevelMeter() {
  const bars = Array.from({ length: 56 }, (_, index) => {
    const seed = Math.sin(index * 12.9898) * 43758.5453;
    const random = seed - Math.floor(seed);
    return { height: 18 + Math.round(random * 82), duration: 700 + ((index * 37) % 650), delay: -((index * 53) % 900), hot: index > 38 && index < 44 };
  });
  return (
    <div className="flex h-10 max-w-xl items-end gap-[3px]" aria-hidden>
      {bars.map((bar, index) => (
        <span
          key={index}
          className={cn("w-[3px] flex-1 origin-bottom rounded-full", bar.hot ? "bg-accent" : "bg-fg/20")}
          style={{ height: `${bar.height}%`, animation: `eq ${bar.duration}ms ease-in-out ${bar.delay}ms infinite` }}
        />
      ))}
    </div>
  );
}

export function LoginScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const inviteToken = useMemo(() => extractInviteToken(next), [next]);

  const [mode, setMode] = useState<Mode>(inviteToken || params.get("mode") === "register" ? "register" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordRepeat, setPasswordRepeat] = useState("");
  /** Registration with password or passwordless with a passkey. */
  const [method, setMethod] = useState<"password" | "passkey">("password");
  const passkeys = useSyncExternalStore(() => () => undefined, passkeysSupported, () => false);
  const [displayName, setDisplayName] = useState("");
  const [bandName, setBandName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [config, setConfig] = useState<InstanceConfig>({ registrationMode: "open", mailConfigured: false });
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.get<InstanceConfig>("/api/auth/config")
      .then((data) => !cancelled && setConfig(data))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Already logged in? Go straight to the app.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store" })
      .then((response) => {
        if (cancelled) return;
        if (response.ok) {
          router.replace(next);
        } else {
          setChecking(false);
        }
      })
      .catch(() => !cancelled && setChecking(false));
    return () => {
      cancelled = true;
    };
  }, [next, router]);

  useEffect(() => {
    if (!inviteToken) return;
    let cancelled = false;
    api.get<InvitePreview>(`/api/band-invites/preview?token=${encodeURIComponent(inviteToken)}`)
      .then((data) => {
        if (cancelled) return;
        setInvite(data);
        if (data.valid && data.email) setEmail(data.email);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [inviteToken]);

  const policyContext = { email, name: displayName, bandName };
  const joiningViaInvite = Boolean(invite?.valid && mode === "register");
  const canRegister = config.registrationMode === "open" || (config.registrationMode === "invite" && Boolean(invite?.valid));

  const switchMode = (value: Mode) => {
    setMode(value);
    setError(null);
    setResetSent(false);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "forgot") {
        await api.post("/api/auth/password/forgot", { email });
        setResetSent(true);
        setLoading(false);
        return;
      }
      if (mode === "twofactor") {
        await api.post("/api/auth/login/2fa", { challenge, code });
        router.replace(next);
        return;
      }
      if (mode === "register" && method === "passkey") {
        await signUpWithPasskey({
          email,
          displayName,
          bandName: joiningViaInvite ? null : bandName || null,
          inviteToken: joiningViaInvite ? inviteToken : null,
        });
        router.replace(joiningViaInvite ? "/app" : next);
        return;
      }
      if (mode === "register") {
        const problems = passwordProblems(password, policyContext);
        if (problems.length) {
          setError(t(`Passwort zu schwach: ${problems.join(" · ")}.`));
          setLoading(false);
          return;
        }
        if (password !== passwordRepeat) {
          setError(t("Die Passwörter stimmen nicht überein."));
          setLoading(false);
          return;
        }
        await api.post("/api/auth/register", {
          email,
          password,
          displayName,
          bandName: joiningViaInvite ? null : bandName || null,
          inviteToken: joiningViaInvite ? inviteToken : null,
        });
        router.replace(joiningViaInvite ? "/app" : next);
      } else {
        const result = await api.post<{ twoFactorRequired?: boolean; challenge?: string }>("/api/auth/login", { email, password });
        if (result?.twoFactorRequired && result.challenge) {
          setChallenge(result.challenge);
          setCode("");
          setMode("twofactor");
          setLoading(false);
          return;
        }
        router.replace(next);
      }
    } catch (err) {
      setError(mode === "register" && method === "passkey" ? passkeyErrorMessage(err) : errorMessage(err));
      setLoading(false);
    }
  };

  const passkeyLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInWithPasskey();
      router.replace(next);
    } catch (err) {
      setError(passkeyErrorMessage(err));
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <BrandMark className="size-10 animate-pulse rounded-xl" />
      </div>
    );
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel – a dark stage with a spotlight, in both themes */}
      <aside className="theme-dark relative hidden overflow-hidden bg-[#0a0c0f] p-12 text-fg lg:flex lg:flex-col lg:justify-between xl:p-16">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_55%_at_38%_-8%,rgb(255_255_255/0.11),transparent_70%)]" aria-hidden />
        <div className="pointer-events-none absolute -bottom-40 -right-24 size-[32rem] rounded-full bg-[radial-gradient(closest-side,rgb(255_98_36/0.18),transparent)] [animation:drift_12s_ease-in-out_infinite]" aria-hidden />
        <Link href="/" className="relative flex w-fit items-center gap-3 [animation:rise-in_700ms_var(--ease-out)_both]">
          <BrandMark className="size-9 rounded-[10px]" />
          <span className="type-display text-[24px]">{t("Bandival")}</span>
        </Link>
        <div className="relative max-w-xl">
          <p className="type-eyebrow text-muted [animation:rise-in_700ms_var(--ease-out)_80ms_both]">{t("Self-hosted Band-Management")}</p>
          <h2 className="type-display mt-6 text-[64px] leading-[0.94] xl:text-[80px] [animation:rise-in_800ms_var(--ease-out)_140ms_both]">
            {t("Weniger Orga.")}<br /><span className="text-muted">{t("Mehr Musik.")}</span>
          </h2>
          <ol className="mt-12 border-t border-border">
            {FEATURES.map((feature, index) => (
              <li
                key={feature.text}
                className="flex items-center gap-5 border-b border-border py-3.5 text-[15px] text-fg/85"
                style={{ animation: `rise-in 700ms var(--ease-out) ${260 + index * 70}ms both` }}
              >
                <span className="type-meta w-6 text-subtle">{String(index + 1).padStart(2, "0")}</span>
                <span className="flex-1">{feature.text}</span>
                <feature.icon className="size-4 text-subtle" strokeWidth={1.6} />
              </li>
            ))}
          </ol>
        </div>
        <div className="relative space-y-7">
          <div className="max-w-xl rounded-[16px] border border-border bg-white/[0.025] p-4 backdrop-blur">
            <p className="type-eyebrow flex items-center gap-2.5 text-fg">
              <span className="led led-pulse" /> {t("Bald · Bandival Pulse")}
              <span className="ml-auto inline-flex items-center gap-1.5 text-muted"><Vibrate className="size-3.5" />{t("in Entwicklung")}</span>
            </p>
            <p className="mt-2.5 text-sm leading-relaxed text-muted">
              {t("Das Metronom zum Fühlen: ein kleines Armband vibriert im Takt – gesteuert aus dem Live-Modus, ohne Kopplung und ohne Internet. Mit der Android-App vibrieren eure Handys schon heute mit.")}
            </p>
          </div>
          <LevelMeter />
          <p className="type-meta text-subtle">{t("Deine Daten bleiben bei dir.")}</p>
        </div>
      </aside>

      {/* Form */}
      <main className="pt-safe flex items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex justify-end text-muted"><LanguageSwitch /></div>
          <Link href="/" className="mb-10 flex w-fit items-center gap-2.5 lg:hidden">
            <BrandMark className="size-9 rounded-[10px]" />
            <span className="type-display text-[22px]">{t("Bandival")}</span>
          </Link>

          <h1 key={mode} className="type-display text-[36px] [animation:rise-in_520ms_var(--ease-out)]">
            {mode === "login"
              ? t("Willkommen zurück")
              : mode === "forgot"
                ? t("Passwort vergessen")
                : mode === "twofactor"
                  ? t("Bestätigungscode")
                  : joiningViaInvite ? `${invite?.bandName} beitreten` : t("Account erstellen")}
          </h1>
          <p className="mt-2.5 text-[15px] leading-relaxed text-muted">
            {mode === "login"
              ? t("Melde dich an, um weiterzumachen.")
              : mode === "forgot"
                ? t("Wir schicken dir einen Link, mit dem du ein neues Passwort setzen kannst.")
                : mode === "twofactor"
                  ? t("Gib den 6-stelligen Code aus deiner Authenticator-App ein – oder einen deiner Wiederherstellungscodes.")
                  : joiningViaInvite
                    ? t(`${invite?.invitedBy ?? t("Deine Band")} hat dich eingeladen.`)
                    : t("Gründe deine Band in weniger als einer Minute.")}
          </p>

          {invite?.valid && mode === "login" ? (
            <div className="mt-5 rounded-[12px] border border-accent/30 bg-accent-soft px-3.5 py-2.5 text-sm">
              {t("Einladung zu")} <strong>{invite.bandName}</strong> {t("– nach der Anmeldung kannst du direkt beitreten.")}
            </div>
          ) : null}
          {invite && !invite.valid ? (
            <div className="mt-5 rounded-xl bg-warning-soft px-3.5 py-2.5 text-sm text-warning">
              {t("Dieser Einladungslink ist nicht mehr gültig.")}
            </div>
          ) : null}

          {(mode === "login" || mode === "register") && canRegister ? (
            <Segmented
              className="mt-6 w-full"
              value={mode}
              onChange={switchMode}
              items={[
                { value: "login", label: t("Anmelden") },
                { value: "register", label: t("Registrieren") },
              ]}
            />
          ) : null}
          {mode === "login" && !canRegister ? (
            <p className="mt-5 rounded-xl bg-surface-2 px-3.5 py-2.5 text-sm text-muted">
              {config.registrationMode === "invite"
                ? t("Neue Accounts gibt es auf dieser Instanz nur per Einladung.")
                : t("Die Registrierung ist auf dieser Instanz geschlossen.")}
            </p>
          ) : null}

          {mode === "forgot" && resetSent ? (
            <div className="mt-6 space-y-4">
              <div className="flex gap-3 rounded-xl border border-success/30 bg-success-soft px-3.5 py-3 text-sm">
                <MailCheck className="mt-0.5 size-4 shrink-0 text-success" />
                <span>{t("Falls zu")} <strong>{email}</strong> {t("ein Account existiert, ist der Link unterwegs. Er ist eine Stunde gültig.")}</span>
              </div>
              <Button variant="secondary" className="w-full" onClick={() => switchMode("login")}>
                <ArrowLeft /> {t("Zurück zur Anmeldung")}
              </Button>
            </div>
          ) : (
          <form onSubmit={submit} className="mt-7 space-y-4">
            {mode === "twofactor" ? (
              <Field label={t("Code")}>
                {(id) => (
                  <Input
                    id={id}
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    autoComplete="one-time-code"
                    inputMode={code.includes("-") ? "text" : "numeric"}
                    autoFocus
                    required
                    placeholder="123456"
                    className="text-center font-mono text-lg tracking-[0.3em]"
                  />
                )}
              </Field>
            ) : null}

            {mode === "register" ? (
              <Field label={t("Dein Name")}>
                {(id) => (
                  <Input id={id} value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" required placeholder={t("Alex")} />
                )}
              </Field>
            ) : null}

            {mode !== "twofactor" ? (
            <Field label={t("E-Mail")}>
              {(id) => (
                <Input
                  id={id}
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete={mode === "login" ? "username webauthn" : "email"}
                  inputMode="email"
                  required
                  placeholder="name@band.de"
                />
              )}
            </Field>
            ) : null}

            {mode === "register" && passkeys ? (
              <div>
                <p className="mb-1.5 text-[13px] font-medium">{t("Anmelden mit")}</p>
                <Segmented
                  className="w-full"
                  size="sm"
                  value={method}
                  onChange={setMethod}
                  items={[
                    { value: "password", label: <><KeyRound /> {t("Passwort")}</> },
                    { value: "passkey", label: <><Fingerprint /> {t("Passkey – ohne Passwort")}</> },
                  ]}
                />
                {method === "passkey" ? (
                  <p className="mt-2 text-xs leading-relaxed text-muted">
                    {t("Dein Gerät speichert einen Passkey – Anmeldung per Fingerabdruck, Gesicht oder Geräte-PIN. Kein Passwort zum Vergessen oder Abfischen.")}
                  </p>
                ) : null}
              </div>
            ) : null}

            {mode === "login" || (mode === "register" && method === "password") ? (
            <Field
              label={t("Passwort")}
              hint={mode === "register"
                ? t("Tipp: Passwort-Manager wie KeePass, Bitwarden oder dein Browser erzeugen ein starkes Passwort.")
                : capsLock ? t("Feststelltaste ist aktiv.") : undefined}
            >
              {(id) => (
                <div className="relative">
                  <Input
                    id={id}
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    onKeyUp={(event) => setCapsLock(event.getModifierState("CapsLock"))}
                    autoComplete={mode === "register" ? "new-password" : "current-password"}
                    required
                    minLength={mode === "register" ? 12 : 1}
                    maxLength={256}
                    className="pr-11"
                    {...(mode === "register" ? { passwordrules: "minlength: 16; required: lower; required: upper; required: digit; required: [-_!?#%&*+=.,;:]; max-consecutive: 3;" } : {})}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted hover:text-fg"
                    aria-label={showPassword ? t("Passwort verbergen") : t("Passwort anzeigen")}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              )}
            </Field>
            ) : null}

            {mode === "login" ? (
              <div className="-mt-2 flex justify-end">
                {config.mailConfigured ? (
                  <button type="button" onClick={() => switchMode("forgot")} className="text-sm text-muted underline-offset-4 hover:text-fg hover:underline">
                    {t("Passwort vergessen?")}
                  </button>
                ) : (
                  <span className="text-xs text-subtle">{t("Passwort vergessen? Wende dich an die Admin deiner Instanz.")}</span>
                )}
              </div>
            ) : null}

            {mode === "register" && method === "password" && password ? (
              <PasswordChecklist password={password} context={policyContext} className="-mt-1 [animation:pop-in_220ms_var(--ease-out)]" />
            ) : null}

            {mode === "register" && method === "password" ? (
              <Field
                label={t("Passwort wiederholen")}
                error={passwordRepeat && password !== passwordRepeat ? t("Die Passwörter stimmen nicht überein.") : undefined}
                hint={passwordRepeat && password === passwordRepeat ? t("✓ Stimmt überein") : undefined}
              >
                {(id) => (
                  <Input
                    id={id}
                    type={showPassword ? "text" : "password"}
                    value={passwordRepeat}
                    onChange={(event) => setPasswordRepeat(event.target.value)}
                    autoComplete="new-password"
                    required
                    minLength={12}
                    maxLength={256}
                  />
                )}
              </Field>
            ) : null}

            {mode === "register" && !joiningViaInvite ? (
              <Field label={t("Name deiner Band")} optional hint={t("Kannst du später ändern. Bandmitglieder lädst du danach ein.")}>
                {(id) => (
                  <Input id={id} value={bandName} onChange={(event) => setBandName(event.target.value)} placeholder={t("z. B. The Rehearsals")} />
                )}
              </Field>
            ) : null}

            {error ? (
              <p role="alert" className="rounded-[12px] bg-danger-soft px-3.5 py-2.5 text-sm text-danger [animation:pop-in_240ms_var(--ease-out)]">{error}</p>
            ) : null}

            <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
              {mode === "login"
                ? t("Anmelden")
                : mode === "forgot"
                  ? <><KeyRound /> {t("Link anfordern")}</>
                  : mode === "twofactor"
                    ? <><ShieldCheck /> {t("Bestätigen")}</>
                    : method === "passkey"
                      ? <><Fingerprint /> {joiningViaInvite ? t("Mit Passkey beitreten") : t("Mit Passkey registrieren")}</>
                      : joiningViaInvite ? t("Account erstellen & beitreten") : t("Account erstellen")}
              {!loading && (mode === "login" || mode === "register") ? <ArrowRight /> : null}
            </Button>

            {mode === "register" ? (
              <p className="text-center text-xs leading-relaxed text-muted">
                {t("Mit der Registrierung akzeptierst du die")} <Link href="/agb" target="_blank" className="underline underline-offset-2 hover:text-fg">{t("AGB")}</Link>
                {t(". Wie wir mit deinen Daten umgehen, steht in der")} <Link href="/datenschutz" target="_blank" className="underline underline-offset-2 hover:text-fg">{t("Datenschutzerklärung")}</Link>.
              </p>
            ) : null}

            {mode === "login" && passkeys ? (
              <>
                <div className="flex items-center gap-3 text-xs text-subtle" aria-hidden>
                  <span className="h-px flex-1 bg-border" />{t("oder")}<span className="h-px flex-1 bg-border" />
                </div>
                <Button type="button" variant="secondary" size="lg" className="w-full" icon={<Fingerprint />} disabled={loading} onClick={() => void passkeyLogin()}>
                  {t("Mit Passkey anmelden")}
                </Button>
              </>
            ) : null}

            {mode === "forgot" || mode === "twofactor" ? (
              <Button type="button" variant="ghost" className="w-full" onClick={() => switchMode("login")}>
                <ArrowLeft /> {t("Zurück zur Anmeldung")}
              </Button>
            ) : null}
          </form>
          )}
          <LegalLinks className="mt-10 justify-center" />
        </div>
      </main>
    </div>
  );
}
