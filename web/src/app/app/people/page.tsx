"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

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
  role: "owner" | "admin" | "member";
};

type BandInvite = {
  id: string;
  email: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt?: string | null;
  createdAt: string;
};

type MemberDraft = {
  role: "owner" | "admin" | "member";
  instrumentPrimary: string;
  busy: boolean;
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

export default function PeoplePage() {
  const router = useRouter();
  const [authUser, setAuthUser] = useState<SessionUser | null>(null);
  const [bandId, setBandId] = useState("");
  const [me, setMe] = useState<MyMember | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [memberDrafts, setMemberDrafts] = useState<Record<string, MemberDraft>>({});
  const [memberQuery, setMemberQuery] = useState("");
  const [invites, setInvites] = useState<BandInvite[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [status, setStatus] = useState("People werden geladen...");

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

  const filteredMembers = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    if (!q) {
      return members;
    }

    return members.filter((member) => {
      const text = `${member.user.displayName ?? ""} ${member.user.email} ${member.role} ${member.instrumentPrimary ?? ""}`.toLowerCase();
      return text.includes(q);
    });
  }, [memberQuery, members]);

  const loadPeople = useCallback(async () => {
    const meRes = await apiFetch("/api/auth/me", { cache: "no-store" });
    if (!meRes.ok) {
      router.replace("/");
      return;
    }

    const meData = await meRes.json();
    const session = (meData.user ?? null) as SessionUser | null;
    setAuthUser(session);

    const currentBandId = session?.defaultBandId ?? window.localStorage.getItem("bandival.bandId") ?? "";
    if (!currentBandId) {
      setStatus("Keine Band gefunden.");
      return;
    }

    setBandId(currentBandId);

    const [membersRes, myRes, invitesRes] = await Promise.all([
      apiFetch(`/api/bands/${currentBandId}/members`, { cache: "no-store" }),
      apiFetch(`/api/bands/${currentBandId}/members/me`, { cache: "no-store" }),
      apiFetch(`/api/bands/${currentBandId}/invites?status=all`, { cache: "no-store" }),
    ]);

    const membersData = await membersRes.json();
    const myData = await myRes.json();
    const invitesData = await invitesRes.json();

    if (!membersRes.ok || !myRes.ok) {
      throw new Error("People konnte nicht geladen werden.");
    }

    setMembers(membersData.members ?? []);
    setMemberDrafts(
      Object.fromEntries(
        (membersData.members ?? []).map((member: Member) => [
          member.id,
          {
            role: member.role,
            instrumentPrimary: member.instrumentPrimary ?? "",
            busy: false,
          },
        ]),
      ),
    );
    setMe(myData.me as MyMember);
    setInvites((invitesData.invites ?? []) as BandInvite[]);
    setStatus("People geladen.");
  }, [router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPeople().catch((error) => {
      setStatus(error instanceof Error ? error.message : "People konnte nicht geladen werden.");
    });
  }, [loadPeople]);

  async function createInvite() {
    if (!bandId || !inviteEmail.trim()) {
      return;
    }

    const response = await apiFetch(`/api/bands/${bandId}/invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail.trim() }),
    });
    const data = await response.json();
    if (!response.ok) {
      setStatus(data.error ?? "Invite fehlgeschlagen.");
      return;
    }

    setInvites((prev) => [data.invite, ...prev]);
    setInviteLink(data.inviteLink ?? "");
    setInviteEmail("");
    setStatus(data.emailSent ? "Einladung per Mail versendet." : "Einladung erstellt.");
  }

  async function saveMember(member: Member) {
    if (!bandId) {
      return;
    }

    const draft = memberDrafts[member.id];
    if (!draft) {
      return;
    }

    setMemberDrafts((prev) => ({ ...prev, [member.id]: { ...prev[member.id], busy: true } }));
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
      setStatus(data.error ?? "Mitglied konnte nicht gespeichert werden.");
      setMemberDrafts((prev) => ({ ...prev, [member.id]: { ...prev[member.id], busy: false } }));
      return;
    }

    setMembers((prev) => prev.map((item) => (item.id === member.id ? data.member : item)));
    setMemberDrafts((prev) => ({ ...prev, [member.id]: { ...prev[member.id], busy: false } }));
    setStatus("Mitglied aktualisiert.");
  }

  async function removeMember(member: Member) {
    if (!bandId) {
      return;
    }

    const response = await apiFetch(`/api/bands/${bandId}/members/${member.id}`, {
      method: "DELETE",
    });
    const data = await response.json();

    if (!response.ok) {
      setStatus(data.error ?? "Mitglied konnte nicht entfernt werden.");
      return;
    }

    setMembers((prev) => prev.filter((item) => item.id !== member.id));
    setStatus("Mitglied entfernt.");
  }

  return (
    <main className="settings-shell">
      <section className="settings-card">
        <header className="workspace-route-hero">
          <h2>People Workspace</h2>
          <p>Team-Rollen, Instrumente und Invite-Lifecycle in einem dedizierten Managementbereich.</p>
        </header>
        <div className="settings-head">
          <h1>People & Invites</h1>
          <span>{authUser?.email ?? ""}</span>
        </div>
        <p className="settings-status">{status}</p>

        <section className="settings-section">
          <h2>Invite Versand</h2>
          <div className="settings-member-toolbar">
            <input
              type="email"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              placeholder="mitglied@email.de"
            />
            <button type="button" onClick={() => void createInvite()} disabled={!inviteEmail.trim()}>
              Einladung senden
            </button>
          </div>
          {inviteLink ? <p>Link: <a href={inviteLink}>{inviteLink}</a></p> : null}
          <ul className="settings-list">
            {invites.slice(0, 10).map((invite) => (
              <li key={invite.id}>
                <strong>{invite.email}</strong>
                <span>{invite.acceptedAt ? "angenommen" : invite.revokedAt ? "widerrufen" : "offen"}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="settings-section">
          <h2>Bandmitglieder</h2>
          <input
            value={memberQuery}
            onChange={(event) => setMemberQuery(event.target.value)}
            placeholder="Mitglieder suchen"
          />
          <ul className="settings-list">
            {filteredMembers.map((member) => (
              <li key={member.id}>
                <strong>{member.user.displayName ?? member.user.email}</strong>
                <span>{member.user.email}</span>
                <span className={`role-badge role-${member.role}`}>{member.role}</span>
                <div className="settings-member-actions">
                  <select
                    value={memberDrafts[member.id]?.role ?? member.role}
                    disabled={!canManageTarget(member) || memberDrafts[member.id]?.busy}
                    onChange={(event) => {
                      const nextRole = event.target.value as Member["role"];
                      setMemberDrafts((prev) => ({
                        ...prev,
                        [member.id]: {
                          ...(prev[member.id] ?? { role: member.role, instrumentPrimary: member.instrumentPrimary ?? "", busy: false }),
                          role: nextRole,
                        },
                      }));
                    }}
                  >
                    {me?.role === "owner" ? (
                      <>
                        <option value="owner">owner</option>
                        <option value="admin">admin</option>
                        <option value="member">member</option>
                      </>
                    ) : (
                      <option value="member">member</option>
                    )}
                  </select>
                  <input
                    value={memberDrafts[member.id]?.instrumentPrimary ?? member.instrumentPrimary ?? ""}
                    onChange={(event) => {
                      const next = event.target.value;
                      setMemberDrafts((prev) => ({
                        ...prev,
                        [member.id]: {
                          ...(prev[member.id] ?? { role: member.role, instrumentPrimary: member.instrumentPrimary ?? "", busy: false }),
                          instrumentPrimary: next,
                        },
                      }));
                    }}
                    placeholder="Instrument"
                    disabled={!canManageTarget(member) || memberDrafts[member.id]?.busy}
                  />
                  <button type="button" className="ghost" onClick={() => void saveMember(member)} disabled={!canManageTarget(member) || memberDrafts[member.id]?.busy}>
                    Speichern
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => void removeMember(member)}
                    disabled={!canManageTarget(member) || member.userId === me?.userId || memberDrafts[member.id]?.busy}
                  >
                    Entfernen
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </section>
    </main>
  );
}
