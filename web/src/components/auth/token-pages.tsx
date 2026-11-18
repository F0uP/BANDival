"use client";

import Link from "next/link";
import { PasswordChecklist } from "@/components/auth/password-checklist";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, CheckCircle2, CircleAlert, KeyRound } from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import { Button, ButtonLink } from "@/components/ui/button";
import { BrandMark } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/form";

function AuthFrame({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <main className="pt-safe flex min-h-dvh items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center gap-2.5">
          <BrandMark className="size-9 rounded-xl" />
          <span className="text-lg font-semibold tracking-tight">Bandival</span>
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-1.5 text-sm text-muted">{subtitle}</p> : null}
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}

function Notice({ tone, children }: { tone: "success" | "danger"; children: ReactNode }) {
  const Icon = tone === "success" ? CheckCircle2 : CircleAlert;
  return (
    <div className={tone === "success"
      ? "flex gap-3 rounded-xl border border-success/30 bg-success-soft px-3.5 py-3 text-sm"
      : "flex gap-3 rounded-xl bg-danger-soft px-3.5 py-3 text-sm text-danger"}
    >
      <Icon className={tone === "success" ? "mt-0.5 size-4 shrink-0 text-success" : "mt-0.5 size-4 shrink-0"} />
      <span>{children}</span>
    </div>
  );
}

export function ResetPasswordScreen() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password !== repeat) {
      setError("Die Passwörter stimmen nicht überein.");
      return;
    }
    setLoading(true);
    try {
      await api.post("/api/auth/password/reset", { token, password });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <AuthFrame title="Link ungültig">
        <Notice tone="danger">Dieser Link ist unvollständig. Fordere auf der Anmeldeseite einen neuen an.</Notice>
        <Button className="mt-4 w-full" variant="secondary" onClick={() => router.replace("/login")}>Zur Anmeldung</Button>
      </AuthFrame>
    );
  }

  if (done) {
    return (
      <AuthFrame title="Passwort geändert">
        <Notice tone="success">Dein neues Passwort ist aktiv. Aus Sicherheitsgründen wurdest du überall abgemeldet.</Notice>
        <Button className="mt-4 w-full" variant="primary" onClick={() => router.replace("/login")}>
          Jetzt anmelden <ArrowRight />
        </Button>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame title="Neues Passwort" subtitle="Danach wirst du auf allen Geräten abgemeldet.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Neues Passwort">
          {(id) => <Input id={id} type="password" autoComplete="new-password" minLength={12} maxLength={256} required value={password} onChange={(event) => setPassword(event.target.value)} />}
        </Field>
        {password ? <PasswordChecklist password={password} /> : null}
        <Field label="Wiederholen">
          {(id) => <Input id={id} type="password" autoComplete="new-password" minLength={12} maxLength={256} required value={repeat} onChange={(event) => setRepeat(event.target.value)} />}
        </Field>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
          <KeyRound /> Passwort speichern
        </Button>
      </form>
    </AuthFrame>
  );
}

export function VerifyEmailScreen() {
  const token = useSearchParams().get("token") ?? "";
  const [state, setState] = useState<"pending" | "ok" | "error">(token ? "pending" : "error");
  const [message, setMessage] = useState(token ? "" : "Dieser Link ist unvollständig.");
  const sent = useRef(false);

  useEffect(() => {
    // Tokens are single-use: guard against the double effect run in development.
    if (!token || sent.current) return;
    sent.current = true;
    api.post("/api/auth/verify-email", { token })
      .then(() => setState("ok"))
      .catch((err) => {
        setMessage(errorMessage(err));
        setState("error");
      });
  }, [token]);

  return (
    <AuthFrame title={state === "ok" ? "E-Mail bestätigt" : state === "error" ? "Bestätigung fehlgeschlagen" : "Einen Moment …"}>
      {state === "pending" ? <p className="text-sm text-muted">Wir prüfen deinen Link.</p> : null}
      {state === "ok" ? <Notice tone="success">Danke! Deine E-Mail-Adresse ist jetzt bestätigt.</Notice> : null}
      {state === "error" ? <Notice tone="danger">{message} Du kannst in den Einstellungen einen neuen Link anfordern.</Notice> : null}
      {state !== "pending" ? (
        <ButtonLink href="/app" variant="primary" className="mt-4 w-full">Zu Bandival <ArrowRight /></ButtonLink>
      ) : null}
    </AuthFrame>
  );
}
