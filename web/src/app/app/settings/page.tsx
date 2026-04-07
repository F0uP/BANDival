"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type SessionUser = {
  userId: string;
  email: string;
  defaultBandId?: string | null;
};

type Member = {
  id: string;
  userId: string;
  role: "owner" | "admin" | "member";
  instrumentPrimary: string | null;
  joinedAt: string;
  user: {
    id: string;
    email: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
};

type MyMember = {
  id: string;
  userId: string;
  user: {
    id: string;
    email: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  role: "owner" | "admin" | "member";
  instrumentPrimary: string | null;
};

type MemberDraft = {
  role: "owner" | "admin" | "member";
  instrumentPrimary: string;
  busy: boolean;
};

const ROLE_ORDER: Record<Member["role"], number> = {
  owner: 0,
  admin: 1,
  member: 2,
};

function readCookie(name: string): string | null {
  const match = document.cookie
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split("=").slice(1).join("=")) : null;
}

async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers ?? undefined);

  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    headers.set("x-csrf-token", readCookie("bandival_csrf") ?? "");
  }

  return fetch(input, { ...init, headers });
}

export default function SettingsPage() {
  const router = useRouter();
  const [authUser, setAuthUser] = useState<SessionUser | null>(null);
  const [bandId, setBandId] = useState<string>("");
  const [me, setMe] = useState<MyMember | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [instrumentPrimary, setInstrumentPrimary] = useState("");
  const [memberQuery, setMemberQuery] = useState("");
  const [memberSort, setMemberSort] = useState<"role" | "name" | "joined">("role");
  const [memberDrafts, setMemberDrafts] = useState<Record<string, MemberDraft>>({});
  const [profileError, setProfileError] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("Einstellungen werden geladen...");

  const canManageMembers = me?.role === "owner" || me?.role === "admin";

  function canManageTarget(member: Member): boolean {
    if (!canManageMembers || !me) {
      return false;
    }

    if (me.role === "owner") {
      return true;
    }

    return member.role === "member";
  }

  function roleOptionsFor(member: Member): Array<Member["role"]> {
    if (!me) {
      return [member.role];
    }

    if (me.role === "owner") {
      return ["owner", "admin", "member"];
    }

    return ["member"];
  }

  const filteredMembers = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    if (!q) {
      return members;
    }

    const searched = members.filter((member) => {
      const haystack = `${member.user.displayName ?? ""} ${member.user.email} ${member.instrumentPrimary ?? ""} ${member.role}`.toLowerCase();
      return haystack.includes(q);
    });

    return searched.sort((a, b) => {
      if (memberSort === "name") {
        const aName = (a.user.displayName ?? a.user.email).toLowerCase();
        const bName = (b.user.displayName ?? b.user.email).toLowerCase();
        return aName.localeCompare(bName);
      }

      if (memberSort === "joined") {
        return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
      }

      const roleDelta = ROLE_ORDER[a.role] - ROLE_ORDER[b.role];
      if (roleDelta !== 0) {
        return roleDelta;
      }

      const aName = (a.user.displayName ?? a.user.email).toLowerCase();
      const bName = (b.user.displayName ?? b.user.email).toLowerCase();
      return aName.localeCompare(bName);
    });
  }, [memberQuery, memberSort, members]);

  const loadSettings = useCallback(async () => {
    const meRes = await apiFetch("/api/auth/me", { cache: "no-store" });
    if (!meRes.ok) {
      router.replace("/");
      return;
    }

    const meData = await meRes.json();
    const sessionUser = (meData.user ?? null) as SessionUser | null;
    setAuthUser(sessionUser);

    const currentBandId = sessionUser?.defaultBandId ?? window.localStorage.getItem("bandival.bandId") ?? "";
    if (!currentBandId) {
      setStatus("Keine Band gefunden. Bitte zuerst Einladung annehmen oder Band anlegen.");
      setLoading(false);
      return;
    }

    setBandId(currentBandId);

    const [membersRes, profileRes] = await Promise.all([
      apiFetch(`/api/bands/${currentBandId}/members`, { cache: "no-store" }),
      apiFetch(`/api/bands/${currentBandId}/members/me`, { cache: "no-store" }),
    ]);

    const membersData = await membersRes.json();
    const profileData = await profileRes.json();

    if (!membersRes.ok) {
      throw new Error(membersData.error ?? "Mitglieder konnten nicht geladen werden.");
    }

    if (!profileRes.ok) {
      throw new Error(profileData.error ?? "Profil konnte nicht geladen werden.");
    }

    const loadedMembers = (membersData.members ?? []) as Member[];
    setMembers(loadedMembers);
    setMemberDrafts(
      Object.fromEntries(
        loadedMembers.map((member) => [
          member.id,
          {
            role: member.role,
            instrumentPrimary: member.instrumentPrimary ?? "",
            busy: false,
          },
        ]),
      ),
    );
    const current = profileData.me as MyMember;
    setMe(current);
    setDisplayName(current.user.displayName ?? "");
    setAvatarUrl(current.user.avatarUrl ?? "");
    setInstrumentPrimary(current.instrumentPrimary ?? "");
    setStatus("Einstellungen geladen.");
    setLoading(false);
  }, [router]);

  useEffect(() => {
    void loadSettings().catch((error) => {
      setStatus(error instanceof Error ? error.message : "Einstellungen konnten nicht geladen werden.");
      setLoading(false);
    });
  }, [loadSettings]);

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (!bandId) {
      return;
    }

    if (!displayName.trim()) {
      setProfileError("Anzeigename darf nicht leer sein.");
      return;
    }

    if (avatarUrl.trim()) {
      try {
        new URL(avatarUrl.trim());
      } catch {
        setProfileError("Avatar URL ist ungueltig.");
        return;
      }
    }

    try {
      setProfileError("");
      const response = await apiFetch(`/api/bands/${bandId}/members/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: displayName.trim(),
          avatarUrl: avatarUrl.trim() ? avatarUrl.trim() : null,
          instrumentPrimary: instrumentPrimary.trim() ? instrumentPrimary.trim() : null,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Profil konnte nicht gespeichert werden.");
      }

      setMe(data.me);
      setStatus("Profil gespeichert.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Profil speichern fehlgeschlagen.");
    }
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault();

    try {
      const response = await apiFetch("/api/account/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Passwort konnte nicht aktualisiert werden.");
      }

      setCurrentPassword("");
      setNewPassword("");
      setStatus("Passwort aktualisiert.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Passwort-Aenderung fehlgeschlagen.");
    }
  }

  async function saveMember(member: Member) {
    if (!bandId) {
      return;
    }

    const draft = memberDrafts[member.id];
    if (!draft) {
      return;
    }

    try {
      setMemberDrafts((prev) => ({
        ...prev,
        [member.id]: {
          ...prev[member.id],
          busy: true,
        },
      }));

      const response = await apiFetch(`/api/bands/${bandId}/members/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: draft.role,
          instrumentPrimary: draft.instrumentPrimary.trim() ? draft.instrumentPrimary.trim() : null,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Mitglied konnte nicht gespeichert werden.");
      }

      await loadSettings();
      setStatus("Mitglied aktualisiert.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Mitglieds-Update fehlgeschlagen.");
    } finally {
      setMemberDrafts((prev) => ({
        ...prev,
        [member.id]: {
          ...(prev[member.id] ?? {
            role: member.role,
            instrumentPrimary: member.instrumentPrimary ?? "",
          }),
          busy: false,
        },
      }));
    }
  }

  async function removeMember(member: Member) {
    if (!bandId) {
      return;
    }

    if (!window.confirm(`Mitglied ${member.user.displayName ?? member.user.email} wirklich entfernen?`)) {
      return;
    }

    try {
      const response = await apiFetch(`/api/bands/${bandId}/members/${member.id}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Mitglied konnte nicht entfernt werden.");
      }

      await loadSettings();
      setStatus("Mitglied entfernt.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Mitglied entfernen fehlgeschlagen.");
    }
  }

  async function leaveBand() {
    if (!bandId) {
      return;
    }

    try {
      const response = await apiFetch("/api/account/leave-band", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bandId }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Band konnte nicht verlassen werden.");
      }

      window.localStorage.removeItem("bandival.bandId");
      setStatus("Band verlassen. Weiterleitung zum Dashboard...");
      router.replace("/app");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Band verlassen fehlgeschlagen.");
    }
  }

  async function deleteAccount(event: FormEvent) {
    event.preventDefault();

    try {
      const response = await apiFetch("/api/account/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: deletePassword }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Account konnte nicht geloescht werden.");
      }

      setStatus("Account geloescht.");
      router.replace("/");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Account-Loeschung fehlgeschlagen.");
    }
  }

  return (
    <main className="settings-shell">
      <section className="settings-card">
        <div className="settings-head">
          <h1>Account & Band Einstellungen</h1>
          <Link href="/app" className="ghost-link">
            Zurueck zum Dashboard
          </Link>
        </div>

        <p className="settings-status">{loading ? "Lade ..." : status}</p>

        <section className="settings-section">
          <h2>Profil</h2>
          <p>
            Eingeloggt als {authUser?.email ?? "-"} {me ? `| Rolle: ${me.role}` : ""}
          </p>
          <div className="settings-avatar-row">
            {avatarUrl.trim() ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="settings-avatar" src={avatarUrl} alt="Avatar Vorschau" />
            ) : (
              <div className="settings-avatar settings-avatar-fallback">
                {(displayName.trim() || authUser?.email || "U").slice(0, 1).toUpperCase()}
              </div>
            )}
            <span>Avatar Vorschau</span>
          </div>
          <form className="settings-form" onSubmit={saveProfile}>
            <label>
              Anzeigename
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={100} />
            </label>
            <label>
              Avatar URL
              <input value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} placeholder="https://..." />
            </label>
            <label>
              Hauptinstrument
              <input value={instrumentPrimary} onChange={(event) => setInstrumentPrimary(event.target.value)} placeholder="z.B. Gitarre" />
            </label>
            <button type="submit" disabled={loading || !bandId}>
              Profil speichern
            </button>
            {profileError ? <p className="settings-error">{profileError}</p> : null}
          </form>
        </section>

        <section className="settings-section">
          <h2>Bandmitglieder</h2>
          <div className="settings-member-toolbar">
            <input
              value={memberQuery}
              onChange={(event) => setMemberQuery(event.target.value)}
              placeholder="Mitglieder suchen"
              aria-label="Mitglieder suchen"
            />
            <select value={memberSort} onChange={(event) => setMemberSort(event.target.value as "role" | "name" | "joined")}>
              <option value="role">Sortierung: Rolle</option>
              <option value="name">Sortierung: Name</option>
              <option value="joined">Sortierung: Beitritt</option>
            </select>
          </div>
          <ul className="settings-list">
            {filteredMembers.map((member) => (
              <li key={member.id}>
                <strong>{member.user.displayName ?? member.user.email}</strong>
                <span>{member.user.email}</span>
                <span className={`role-badge role-${member.role}`}>{member.role}</span>
                <span>Seit {new Date(member.joinedAt).toLocaleDateString("de-DE")}</span>
                <div className="settings-member-actions">
                  <select
                    value={memberDrafts[member.id]?.role ?? member.role}
                    disabled={!canManageTarget(member) || memberDrafts[member.id]?.busy}
                    onChange={(event) => {
                      const nextRole = event.target.value as Member["role"];
                      setMemberDrafts((prev) => ({
                        ...prev,
                        [member.id]: {
                          ...(prev[member.id] ?? {
                            role: member.role,
                            instrumentPrimary: member.instrumentPrimary ?? "",
                            busy: false,
                          }),
                          role: nextRole,
                        },
                      }));
                    }}
                  >
                    {roleOptionsFor(member).map((role) => (
                      <option key={role} value={role}>
                        Rolle: {role}
                      </option>
                    ))}
                  </select>
                  <input
                    value={memberDrafts[member.id]?.instrumentPrimary ?? member.instrumentPrimary ?? ""}
                    placeholder="Instrument"
                    disabled={!canManageTarget(member) || memberDrafts[member.id]?.busy}
                    onChange={(event) => {
                      const nextInstrument = event.target.value;
                      setMemberDrafts((prev) => ({
                        ...prev,
                        [member.id]: {
                          ...(prev[member.id] ?? {
                            role: member.role,
                            instrumentPrimary: member.instrumentPrimary ?? "",
                            busy: false,
                          }),
                          instrumentPrimary: nextInstrument,
                        },
                      }));
                    }}
                  />
                  <button
                    type="button"
                    className="ghost"
                    disabled={!canManageTarget(member) || memberDrafts[member.id]?.busy}
                    onClick={() => void saveMember(member)}
                  >
                    Speichern
                  </button>
                  <button
                    type="button"
                    className="danger"
                    disabled={!canManageTarget(member) || member.userId === me?.userId || memberDrafts[member.id]?.busy}
                    onClick={() => void removeMember(member)}
                  >
                    Entfernen
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="settings-section">
          <h2>Passwort</h2>
          <form className="settings-form" onSubmit={savePassword}>
            <label>
              Aktuelles Passwort
              <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
            </label>
            <label>
              Neues Passwort
              <input type="password" minLength={10} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
            </label>
            <button type="submit" disabled={loading}>
              Passwort aktualisieren
            </button>
          </form>
        </section>

        <section className="settings-section settings-danger">
          <h2>Gefahrenzone</h2>
          <button type="button" className="danger" onClick={() => void leaveBand()} disabled={!bandId || loading}>
            Aktuelle Band verlassen
          </button>
          <form className="settings-form" onSubmit={deleteAccount}>
            <label>
              Passwort bestaetigen
              <input
                type="password"
                value={deletePassword}
                onChange={(event) => setDeletePassword(event.target.value)}
                placeholder="Passwort fuer Account-Loeschung"
              />
            </label>
            <button type="submit" className="danger" disabled={loading || !deletePassword}>
              Account loeschen
            </button>
          </form>
        </section>
      </section>
    </main>
  );
}
