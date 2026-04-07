"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";

export function LoginScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [status, setStatus] = useState("Bitte anmelden.");
  const [loading, setLoading] = useState(false);
  const [authSuccess, setAuthSuccess] = useState(false);
  const redirectTimeoutRef = useRef<number | null>(null);

  function updateCapsLockState(event: React.KeyboardEvent<HTMLInputElement>) {
    setCapsLockOn(event.getModifierState("CapsLock"));
  }

  function getPasswordStrength(value: string): { score: number; label: string } {
    if (!value) {
      return { score: 0, label: "Keine Eingabe" };
    }

    let score = 0;
    if (value.length >= 8) score += 1;
    if (value.length >= 12) score += 1;
    if (/[A-Z]/.test(value)) score += 1;
    if (/[a-z]/.test(value)) score += 1;
    if (/\d/.test(value)) score += 1;
    if (/[^A-Za-z0-9]/.test(value)) score += 1;

    const normalized = Math.min(4, Math.floor((score / 6) * 5));
    const labels = ["Schwach", "Ausbaufähig", "Okay", "Gut", "Stark"];
    return { score: normalized, label: labels[normalized] };
  }

  const strength = getPasswordStrength(password);

  function handleEnterSubmit(event: KeyboardEvent<HTMLInputElement>) {
    updateCapsLockState(event);
    if (event.key === "Enter") {
      const form = event.currentTarget.form;
      if (form) {
        form.requestSubmit();
      }
    }
  }

  function readCookie(name: string): string | null {
    const match = document.cookie
      .split(";")
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith(`${name}=`));
    return match ? decodeURIComponent(match.split("=").slice(1).join("=")) : null;
  }

  async function ensureCsrfToken(): Promise<string> {
    const existing = readCookie("bandival_csrf");
    if (existing) {
      return existing;
    }

    const csrfRes = await fetch("/api/auth/csrf", {
      cache: "no-store",
      credentials: "same-origin",
    });
    const csrfData = await csrfRes.json();
    const fromCookie = readCookie("bandival_csrf");
    return fromCookie ?? csrfData.csrfToken ?? "";
  }

  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      await fetch("/api/auth/csrf", { cache: "no-store", credentials: "same-origin" });
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (res.ok && mounted) {
        router.replace("/app");
      }
    }

    void checkSession();
    return () => {
      mounted = false;
    };
  }, [router]);

  useEffect(() => {
    return () => {
      if (redirectTimeoutRef.current !== null) {
        window.clearTimeout(redirectTimeoutRef.current);
      }
    };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);

    try {
      const csrfToken = await ensureCsrfToken();
      if (!csrfToken) {
        throw new Error("CSRF Token konnte nicht geladen werden. Bitte Seite neu laden.");
      }

      const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
      const res = await fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify(
          mode === "register"
            ? { email, password, displayName }
            : { email, password },
        ),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Login fehlgeschlagen.");
      }

      setStatus(mode === "register" ? "Account erstellt. Weiterleitung..." : "Login erfolgreich. Weiterleitung...");
      setAuthSuccess(true);
      redirectTimeoutRef.current = window.setTimeout(() => {
        router.replace("/app");
      }, 460);
    } catch (error) {
      setAuthSuccess(false);
      setStatus(error instanceof Error ? error.message : "Login fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell">
      <div className="auth-orb auth-orb-a" />
      <div className="auth-orb auth-orb-b" />
      <section className={authSuccess ? "auth-card auth-card-success" : "auth-card"}>
        <div className="auth-head">
          <Image src="/bandival_logo.svg" alt="Bandival Logo" width={52} height={52} priority />
          <div>
            <h1>
              {mode === "register" ? "Bandival Registrierung" : "Bandival Login"}
            </h1>
            <p>Self-hosted Zugang</p>
          </div>
        </div>

        <div className="auth-tabs">
          <button
            type="button"
            className={mode === "login" ? "" : "ghost"}
            onClick={() => {
              setMode("login");
              setStatus("Bitte anmelden.");
            }}
          >
            Login
          </button>
          <button
            type="button"
            className={mode === "register" ? "" : "ghost"}
            onClick={() => {
              setMode("register");
              setStatus("Neuen Account erstellen.");
            }}
          >
            Registrieren
          </button>
        </div>

        <form onSubmit={submit} className="auth-form">
          {mode === "register" ? (
            <label>
              Name
              <input
                placeholder="Dein Anzeigename"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                onKeyDown={handleEnterSubmit}
                autoComplete="name"
                required
                minLength={1}
                disabled={loading || authSuccess}
              />
            </label>
          ) : null}
          <label>
            Email
            <input
              type="email"
              placeholder="name@band.de"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={handleEnterSubmit}
              autoComplete="username"
              required
              disabled={loading || authSuccess}
            />
          </label>
          <label>
            Passwort
            <div className="auth-password-row">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Mindestens 8 Zeichen"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={handleEnterSubmit}
                onKeyUp={updateCapsLockState}
                onBlur={() => setCapsLockOn(false)}
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                required
                minLength={8}
                disabled={loading || authSuccess}
              />
              <button
                type="button"
                className="ghost"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Passwort verbergen" : "Passwort anzeigen"}
                disabled={loading || authSuccess}
              >
                {showPassword ? "Verbergen" : "Anzeigen"}
              </button>
            </div>
          </label>

          {mode === "register" ? (
            <div className="auth-strength" aria-live="polite">
              <div className="auth-strength-bar" data-score={strength.score}>
                <span />
              </div>
              <small>Passwortstärke: {strength.label}</small>
            </div>
          ) : null}

          {capsLockOn ? <p className="auth-caps">Hinweis: Feststelltaste (Caps Lock) ist aktiv.</p> : null}

          <button type="submit" disabled={loading || authSuccess}>
            {authSuccess ? "Weiterleitung..." : loading ? "Bitte warten..." : mode === "register" ? "Account erstellen" : "Anmelden"}
          </button>
        </form>

        <p className="auth-status">{status}</p>
      </section>
    </main>
  );
}
