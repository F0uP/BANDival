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
    email: string;
    displayName: string | null;
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
  const [status, setStatus] = useState("Activity wird geladen...");
  const pageSize = 20;

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
        setStatus(logsData.error ?? "Activity konnte nicht geladen werden.");
        return;
      }

      setLogs((logsData.logs ?? []) as AuditLogEntry[]);
      setStatus("Activity geladen.");
    }

    void loadActivity();
  }, []);

  return (
    <main className="settings-shell">
      <section className="settings-card">
        <header className="workspace-route-hero">
          <h2>Activity</h2>
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
        <ul className="settings-list">
          {logs
            .filter((entry) => entityFilter === "all" || entry.entityType === entityFilter)
            .slice((page - 1) * pageSize, page * pageSize)
            .map((entry) => (
            <li key={entry.id}>
              <strong>{entry.action}</strong>
              <span>{new Date(entry.createdAt).toLocaleString("de-DE")}</span>
              <span>{entry.entityType}{entry.entityId ? ` (${entry.entityId})` : ""}</span>
              <span>{entry.actor?.displayName ?? entry.actor?.email ?? "system"}</span>
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
