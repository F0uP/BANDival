"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

export function LoginScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [displayName, setDisplayName] = useState("Bandival User");
  const [email, setEmail] = useState("demo@bandival.local");
  const [password, setPassword] = useState("bandival123");
  const [status, setStatus] = useState("Bitte anmelden.");
  const [loading, setLoading] = useState(false);

  function readCookie(name: string): string | null {
    const match = document.cookie
      .split(";")
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith(`${name}=`));
    return match ? decodeURIComponent(match.split("=").slice(1).join("=")) : null;
  }

  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      await fetch("/api/auth/csrf", { cache: "no-store" });
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

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);

    try {
      const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": readCookie("bandival_csrf") ?? "",
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

      router.replace("/app");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Login fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="dashboard-shell" style={{ justifyContent: "center", alignItems: "center" }}>
      <section className="box" style={{ width: "min(92vw, 460px)", padding: "1.2rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.7rem", marginBottom: "0.9rem" }}>
          <Image src="/bandival_logo.svg" alt="Bandival Logo" width={52} height={52} priority />
          <div>
            <h1 style={{ margin: 0, fontSize: "1.55rem" }}>
              {mode === "register" ? "Bandival Registrierung" : "Bandival Login"}
            </h1>
            <p style={{ margin: "0.2rem 0 0", color: "var(--muted)" }}>Self-hosted Zugang</p>
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.8rem" }}>
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

        <form onSubmit={submit} style={{ display: "grid", gap: "0.7rem" }}>
          {mode === "register" ? (
            <label>
              Name
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required minLength={1} />
            </label>
          ) : null}
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Passwort
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>
          <button type="submit" disabled={loading}>
            {loading ? "Bitte warten..." : mode === "register" ? "Account erstellen" : "Anmelden"}
          </button>
        </form>

        <p style={{ marginTop: "0.8rem", color: "var(--muted)" }}>{status}</p>
      </section>
    </main>
  );
}
