import { Dispatch, SetStateAction, useCallback } from "react";

type BandInvite = {
  id: string;
  email: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt?: string | null;
  createdAt: string;
};

export function useInvitesController(args: {
  apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  bandId: string;
  inviteEmail: string;
  inviteTokenInput: string;
  selectedInviteIds: string[];
  setInvites: Dispatch<SetStateAction<BandInvite[]>>;
  setInviteEmail: Dispatch<SetStateAction<string>>;
  setLastInviteLink: Dispatch<SetStateAction<string>>;
  setInviteTokenInput: Dispatch<SetStateAction<string>>;
  setBandId: Dispatch<SetStateAction<string>>;
  setSelectedInviteIds: Dispatch<SetStateAction<string[]>>;
  setStatusMessage: Dispatch<SetStateAction<string>>;
  loadData: (bandId: string) => Promise<void>;
}) {
  const {
    apiFetch,
    bandId,
    inviteEmail,
    inviteTokenInput,
    selectedInviteIds,
    setInvites,
    setInviteEmail,
    setLastInviteLink,
    setInviteTokenInput,
    setBandId,
    setSelectedInviteIds,
    setStatusMessage,
    loadData,
  } = args;

  const createInvite = useCallback(async () => {
    if (!inviteEmail.trim()) {
      return;
    }

    try {
      const res = await apiFetch(`/api/bands/${bandId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Einladung konnte nicht erstellt werden.");
      }

      setInvites((prev) => [data.invite, ...prev]);
      setInviteEmail("");
      setLastInviteLink(data.inviteLink ?? `${window.location.origin}/app?inviteToken=${encodeURIComponent(data.inviteToken)}`);
      setStatusMessage(data.emailSent ? "Einladung erstellt und per Mail versendet." : "Einladung erstellt. Link kann direkt geteilt werden.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Einladung fehlgeschlagen.");
    }
  }, [apiFetch, bandId, inviteEmail, setInviteEmail, setInvites, setLastInviteLink, setStatusMessage]);

  const resendInvite = useCallback(async (inviteId: string) => {
    try {
      const res = await apiFetch(`/api/bands/${bandId}/invites/${inviteId}`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Einladung konnte nicht erneut gesendet werden.");
      }

      setInvites((prev) => [data.invite, ...prev.filter((invite) => invite.id !== inviteId)]);
      setLastInviteLink(data.inviteLink);
      setStatusMessage(data.emailSent ? "Einladung erneut versendet." : "Neuer Einladungslink erzeugt.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Erneutes Senden fehlgeschlagen.");
    }
  }, [apiFetch, bandId, setInvites, setLastInviteLink, setStatusMessage]);

  const copyInviteLink = useCallback(async (inviteId: string) => {
    try {
      const res = await apiFetch(`/api/bands/${bandId}/invites/${inviteId}`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Einladungslink konnte nicht erzeugt werden.");
      }

      setInvites((prev) => [data.invite, ...prev.filter((invite) => invite.id !== inviteId)]);
      setLastInviteLink(data.inviteLink);
      await navigator.clipboard.writeText(data.inviteLink);
      setStatusMessage("Einladungslink in Zwischenablage kopiert.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Link kopieren fehlgeschlagen.");
    }
  }, [apiFetch, bandId, setInvites, setLastInviteLink, setStatusMessage]);

  const extendInvite = useCallback(async (inviteId: string) => {
    const daysRaw = window.prompt("Um wie viele Tage verlaengern?", "14");
    const days = Number(daysRaw);
    if (!Number.isFinite(days) || days < 1) {
      return;
    }

    try {
      const res = await apiFetch(`/api/bands/${bandId}/invites/${inviteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiresInDays: Math.floor(days) }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Ablaufdatum konnte nicht aktualisiert werden.");
      }

      setInvites((prev) => prev.map((invite) => (invite.id === inviteId ? data.invite : invite)));
      setStatusMessage("Einladung aktualisiert.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Ablaufdatum-Update fehlgeschlagen.");
    }
  }, [apiFetch, bandId, setInvites, setStatusMessage]);

  const extractInviteToken = useCallback((rawValue: string): string => {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      return "";
    }

    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      try {
        const parsed = new URL(trimmed);
        return parsed.searchParams.get("inviteToken") ?? parsed.searchParams.get("token") ?? "";
      } catch {
        return "";
      }
    }

    return trimmed;
  }, []);

  const acceptInviteToken = useCallback(async () => {
    const inviteToken = extractInviteToken(inviteTokenInput);
    if (!inviteToken) {
      setStatusMessage("Bitte gueltigen Invite-Link oder Token eingeben.");
      return;
    }

    try {
      const res = await apiFetch("/api/band-invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: inviteToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Einladung konnte nicht angenommen werden.");
      }

      setInviteTokenInput("");
      setStatusMessage("Einladung angenommen.");
      if (data.bandId) {
        setBandId(data.bandId);
        await loadData(data.bandId);
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Einladungsannahme fehlgeschlagen.");
    }
  }, [apiFetch, extractInviteToken, inviteTokenInput, loadData, setBandId, setInviteTokenInput, setStatusMessage]);

  const revokeInvite = useCallback(async (inviteId: string) => {
    try {
      const res = await apiFetch(`/api/bands/${bandId}/invites/${inviteId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Einladung konnte nicht widerrufen werden.");
      }

      setInvites((prev) => prev.filter((invite) => invite.id !== inviteId));
      setStatusMessage("Einladung widerrufen.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Widerruf fehlgeschlagen.");
    }
  }, [apiFetch, bandId, setInvites, setStatusMessage]);

  const bulkResendSelectedInvites = useCallback(async () => {
    if (selectedInviteIds.length === 0) {
      return;
    }

    try {
      const responses = await Promise.all(
        selectedInviteIds.map(async (inviteId) => {
          const res = await apiFetch(`/api/bands/${bandId}/invites/${inviteId}`, { method: "POST" });
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error ?? `Einladung ${inviteId} konnte nicht erneut gesendet werden.`);
          }
          return data;
        }),
      );

      const replacementIds = new Set(selectedInviteIds);
      const createdInvites = responses.map((r) => r.invite as BandInvite);
      setInvites((prev) => [...createdInvites, ...prev.filter((invite) => !replacementIds.has(invite.id))]);
      setSelectedInviteIds([]);
      if (responses[0]?.inviteLink) {
        setLastInviteLink(responses[0].inviteLink);
      }
      setStatusMessage(`${responses.length} Einladungen erneut gesendet.`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Bulk-Resend fehlgeschlagen.");
    }
  }, [apiFetch, bandId, selectedInviteIds, setInvites, setLastInviteLink, setSelectedInviteIds, setStatusMessage]);

  return {
    createInvite,
    resendInvite,
    copyInviteLink,
    extendInvite,
    acceptInviteToken,
    revokeInvite,
    bulkResendSelectedInvites,
  };
}
