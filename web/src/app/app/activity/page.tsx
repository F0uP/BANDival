"use client";

import { useEffect, useState } from "react";

type AuditLogEntry = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  payload: unknown;
  createdAt: string;
  actor?: {
    id?: string;
    email: string;
    displayName: string | null;
    avatarUrl?: string | null;
  } | null;
};

type SessionUser = {
  defaultBandId?: string | null;
};

async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  return fetch(input, init);
}

export default function ActivityPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [entityFilter, setEntityFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("Aktivitaeten werden geladen...");
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const pageSize = 20;

  useEffect(() => {
    const hasError = /konnte nicht|fehlgeschlagen|nicht eingeloggt|keine band|forbidden|not authorized|access denied|error/i.test(status);
    if (!hasError) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setErrorToast(status);
    const timeoutId = window.setTimeout(() => setErrorToast(null), 6000);
    return () => window.clearTimeout(timeoutId);
  }, [status]);

  useEffect(() => {
    async function loadActivity() {
      const meRes = await apiFetch("/api/auth/me", { cache: "no-store" });
      if (!meRes.ok) {
        setStatus("Nicht eingeloggt.");
        return;
      }

      const meData = await meRes.json();
      const me = (meData.user ?? null) as SessionUser | null;
      const bandId = me?.defaultBandId ?? window.localStorage.getItem("bandival.bandId") ?? "";
      if (!bandId) {
        setStatus("Keine Band gefunden.");
        return;
      }

      const logsRes = await apiFetch(`/api/bands/${bandId}/audit?limit=120`, { cache: "no-store" });
      const logsData = await logsRes.json();
      if (!logsRes.ok) {
        setStatus(logsData.error ?? "Aktivitaeten konnten nicht geladen werden.");
        return;
      }

      setLogs((logsData.logs ?? []) as AuditLogEntry[]);
      setStatus("Aktivitaeten geladen.");
    }

    void loadActivity();
  }, []);

  return (
    <main className="settings-shell">
      {errorToast ? (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            position: "fixed",
            top: "1rem",
            right: "1rem",
            zIndex: 1000,
            maxWidth: "26rem",
            background: "#991b1b",
            color: "#fff",
            padding: "0.75rem 0.9rem",
            borderRadius: "0.7rem",
            boxShadow: "0 8px 20px rgba(0,0,0,0.25)",
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
          }}
        >
          <span style={{ flex: 1 }}>{errorToast}</span>
          <button
            type="button"
            onClick={() => setErrorToast(null)}
            style={{
              border: "1px solid rgba(255,255,255,0.5)",
              background: "transparent",
              color: "#fff",
              borderRadius: "0.45rem",
              padding: "0.2rem 0.45rem",
              cursor: "pointer",
            }}
            aria-label="Fehlermeldung schliessen"
          >
            x
          </button>
        </div>
      ) : null}

      <section className="settings-card">
        <header className="workspace-route-hero">
          <h2>Aktivitaeten</h2>
          <p>Alle relevanten Aktionen der Band chronologisch.</p>
        </header>
        <p className="settings-status">{status}</p>
        <div className="settings-member-toolbar">
          <select value={entityFilter} onChange={(event) => { setEntityFilter(event.target.value); setPage(1); }}>
            <option value="all">Alle</option>
            <option value="song">Songs</option>
            <option value="setlist">Setlists</option>
            <option value="event">Events</option>
            <option value="member">Members</option>
            <option value="band">Band</option>
          </select>
        </div>
        <ul className="settings-list stagger-in">
          {logs
            .filter((entry) => entityFilter === "all" || entry.entityType === entityFilter)
            .slice((page - 1) * pageSize, page * pageSize)
            .map((entry) => (
            <li key={entry.id}>
              <strong>{entry.action}</strong>
              <span>{new Date(entry.createdAt).toLocaleString("de-DE")}</span>
              <span>{entry.entityType}{entry.entityId ? ` (${entry.entityId})` : ""}</span>
              <span style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                {entry.actor?.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="settings-avatar" src={entry.actor.avatarUrl} alt={entry.actor.displayName ?? entry.actor.email} style={{ width: "26px", height: "26px" }} />
                ) : (
                  <span className="settings-avatar settings-avatar-fallback" style={{ width: "26px", height: "26px", fontSize: "0.72rem" }}>
                    {(entry.actor?.displayName ?? entry.actor?.email ?? "S").slice(0, 1).toUpperCase()}
                  </span>
                )}
                {entry.actor?.displayName ?? entry.actor?.email ?? "system"}
              </span>
            </li>
          ))}
        </ul>
        <div className="settings-member-toolbar">
          <button type="button" className="ghost" onClick={() => setPage((prev) => Math.max(1, prev - 1))}>Zurueck</button>
          <span>Seite {page}</span>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              const filtered = logs.filter((entry) => entityFilter === "all" || entry.entityType === entityFilter);
              const maxPage = Math.max(1, Math.ceil(filtered.length / pageSize));
              setPage((prev) => Math.min(maxPage, prev + 1));
            }}
          >
            Weiter
          </button>
        </div>
      </section>
    </main>
  );
}
