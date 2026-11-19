"use client";

import { useState } from "react";
import { Clock, Copy, Crown, Guitar, ListMusic, MailPlus, MoreHorizontal, RefreshCw, Send, Shield, Trash2, UserMinus, Users } from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import { formatDate, formatRelative } from "@/lib/client/format";
import { useInvites, useMembers, useSetlists } from "@/lib/client/hooks";
import type { BandMember, BandRole, Invite } from "@/lib/client/types";
import { ROLE_LABELS } from "@/lib/permissions";
import { Button, ButtonLink } from "@/components/ui/button";
import { Avatar, Badge, Card, CardHeader, PageHeader, SkeletonList } from "@/components/ui/display";
import { Input } from "@/components/ui/form";
import { Menu, Segmented, type MenuItem } from "@/components/ui/navigation";
import { useConfirm, useToast } from "@/components/ui/feedback";
import { useSession } from "@/components/providers/session";
import { t } from "@/lib/i18n";

function inviteState(invite: Invite): { label: string; tone: "accent" | "success" | "neutral" | "warning" } {
  if (invite.revokedAt) return { label: t("Widerrufen"), tone: "neutral" };
  if (invite.acceptedAt) return { label: t("Angenommen"), tone: "success" };
  if (new Date(invite.expiresAt).getTime() < Date.now()) return { label: t("Abgelaufen"), tone: "warning" };
  return { label: t("Offen"), tone: "accent" };
}

const ROLE_ICON: Record<BandRole, React.ReactNode> = {
  owner: <Crown className="size-3" />,
  admin: <Shield className="size-3" />,
  member: null,
  guest: <Guitar className="size-3" />,
};

export function BandView() {
  const { bandId, band, me, can, refresh } = useSession();
  const members = useMembers(bandId);
  const canInvite = can("invites.manage");
  const invites = useInvites(bandId, canInvite);
  const confirm = useConfirm();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "guest">("member");
  const [guestSetlists, setGuestSetlists] = useState<string[]>([]);
  const setlists = useSetlists(canInvite ? bandId : null);
  const [inviting, setInviting] = useState(false);
  const [showAllInvites, setShowAllInvites] = useState(false);

  const myRole = band?.role ?? "member";

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("Einladungslink kopiert."));
    } catch {
      await confirm({ title: t("Einladungslink"), description: t("Kopieren nicht möglich – bitte manuell kopieren."), input: { defaultValue: text }, confirmLabel: t("Fertig") });
    }
  };

  const invite = async () => {
    if (!email.trim() || !bandId) return;
    setInviting(true);
    try {
      const result = await api.post<{ inviteLink: string; emailSent: boolean }>(`/api/bands/${bandId}/invites`, {
        email: email.trim(),
        role: inviteRole,
        guestSetlistIds: inviteRole === "guest" ? guestSetlists : [],
      });
      setEmail("");
      setGuestSetlists([]);
      await invites.mutate();
      if (result.emailSent) {
        toast.success(t("Einladung per E-Mail verschickt."));
      } else {
        await copy(result.inviteLink);
        toast.info(t("Kein Mailserver eingerichtet – der Link wurde kopiert. Schick ihn einfach per Messenger."));
      }
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setInviting(false);
    }
  };

  const inviteAction = async (inviteId: string, action: "resend" | "copy" | "extend" | "revoke") => {
    if (!bandId) return;
    try {
      if (action === "revoke") {
        const ok = await confirm({ title: t("Einladung widerrufen?"), confirmLabel: t("Widerrufen"), tone: "danger" });
        if (!ok) return;
        await api.delete(`/api/bands/${bandId}/invites/${inviteId}`);
        toast.success(t("Einladung widerrufen."));
      } else if (action === "extend") {
        await api.patch(`/api/bands/${bandId}/invites/${inviteId}`, { expiresInDays: 14 });
        toast.success(t("Um 14 Tage verlängert."));
      } else {
        const result = await api.post<{ inviteLink: string; emailSent: boolean }>(`/api/bands/${bandId}/invites/${inviteId}`);
        if (action === "copy") await copy(result.inviteLink);
        else toast.success(result.emailSent ? t("Erneut gesendet.") : t("Neuer Link erstellt (kein Mailserver)."));
      }
      await invites.mutate();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const updateMember = async (member: BandMember, patch: { role?: BandRole; instrumentPrimary?: string | null }) => {
    if (!bandId) return;
    try {
      await api.patch(`/api/bands/${bandId}/members/${member.id}`, patch);
      await members.mutate();
      if (member.userId === me?.userId) await refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const editInstrument = async (member: BandMember) => {
    const value = await confirm({
      title: t("Instrument"),
      description: t("Wird für Lead-Sheet-Tabs, Besetzung und Setlists genutzt."),
      confirmLabel: t("Speichern"),
      input: { defaultValue: member.instrumentPrimary ?? "", placeholder: t("z. B. Bass, Gesang, Drums") },
    });
    if (typeof value === "string") await updateMember(member, { instrumentPrimary: value.trim() || null });
  };

  const removeMember = async (member: BandMember) => {
    if (!bandId) return;
    const ok = await confirm({ title: t("{name} entfernen?", { name: member.user.displayName }), description: t("Die Person verliert sofort den Zugriff auf die Band."), confirmLabel: t("Entfernen"), tone: "danger" });
    if (!ok) return;
    try {
      await api.delete(`/api/bands/${bandId}/members/${member.id}`);
      await members.mutate();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const editGuestSetlists = async (member: BandMember) => {
    const all = setlists.data?.setlists ?? [];
    const current = new Set((member.guestSetlists ?? []).map((entry) => entry.setlistId));
    const answer = await confirm({
      title: t(`Setlists für ${member.user.displayName}`),
      description: t(`Nummern durch Komma getrennt:\n${all.map((setlist, index) => `${index + 1}. ${setlist.name}${current.has(setlist.id) ? " ✓" : ""}`).join("\n")}`),
      confirmLabel: t("Speichern"),
      input: { defaultValue: all.map((setlist, index) => (current.has(setlist.id) ? index + 1 : null)).filter(Boolean).join(", "), allowEmpty: true },
    });
    if (typeof answer !== "string" || !bandId) return;
    const ids = answer.split(/[,\s]+/).map((value) => all[Number(value) - 1]?.id).filter((value): value is string => Boolean(value));
    try {
      await api.patch(`/api/bands/${bandId}/members/${member.id}`, { guestSetlistIds: ids });
      await members.mutate();
      toast.success(t("Freigaben gespeichert."));
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const memberMenu = (member: BandMember): MenuItem[] => {
    const isSelf = member.userId === me?.userId;
    const canManage = myRole === "owner" || (myRole === "admin" && (member.role === "member" || member.role === "guest"));
    const items: MenuItem[] = [];
    if (isSelf || canManage) {
      items.push({ label: t("Instrument ändern"), icon: <Guitar />, onSelect: () => void editInstrument(member) });
    }
    if (canManage && !isSelf) {
      if (myRole === "owner") {
        items.push({ type: "label", label: t("Rolle") });
        (["owner", "admin", "member", "guest"] as BandRole[]).forEach((role) => items.push({
          label: ROLE_LABELS[role],
          icon: ROLE_ICON[role] ?? <span className="inline-block size-4" />,
          disabled: member.role === role,
          onSelect: () => void updateMember(member, { role }),
        }));
      }
      if (member.role === "guest") {
        items.push({ label: t("Freigegebene Setlists …"), icon: <ListMusic />, onSelect: () => void editGuestSetlists(member) });
      }
      items.push({ type: "separator" }, { label: t("Aus Band entfernen"), icon: <UserMinus />, danger: true, onSelect: () => void removeMember(member) });
    }
    return items;
  };

  const visibleInvites = (invites.data?.invites ?? []).filter((entry) => showAllInvites || (!entry.acceptedAt && !entry.revokedAt));

  return (
    <>
      <PageHeader
        title={t("Band")}
        description={band ? `${band.name} · ${members.data?.members.length ?? "–"} Mitglieder` : undefined}
        actions={<ButtonLink href="/app/band/rider" icon={<Guitar />}>{t("Tech-Rider & Stage-Plot")}</ButtonLink>}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <Card padded={false}>
          <div className="p-4 pb-2 sm:p-5 sm:pb-2">
            <CardHeader title={t("Mitglieder")} icon={<Users />} />
          </div>
          {members.isLoading ? <div className="p-4"><SkeletonList rows={3} /></div> : (
            <ul className="divide-y divide-border">
              {(members.data?.members ?? []).map((member) => {
                const menu = memberMenu(member);
                return (
                  <li key={member.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                    <Avatar name={member.user.displayName} src={member.user.avatarUrl} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{member.user.displayName}</span>
                        {member.userId === me?.userId ? <span className="text-xs text-muted">{t("(du)")}</span> : null}
                      </div>
                      <div className="truncate text-[13px] text-muted">
                        {member.instrumentPrimary ? `${member.instrumentPrimary} · ` : ""}{member.user.email}
                      </div>
                    </div>
                    <Badge tone={member.role === "member" ? "neutral" : "accent"} className="hidden sm:inline-flex">
                      {ROLE_ICON[member.role]}{ROLE_LABELS[member.role]}
                    </Badge>
                    {menu.length > 0 ? (
                      <Menu trigger={({ toggle }) => <Button size="icon-sm" variant="ghost" onClick={toggle} aria-label={t("Aktionen")}><MoreHorizontal /></Button>} items={menu} />
                    ) : <span className="size-8" />}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          {canInvite ? (
            <Card>
              <CardHeader title={t("Einladen")} icon={<MailPlus />} description={t("Per E-Mail oder als Link für WhatsApp & Co.")} />
              <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void invite(); }}>
                <Segmented
                  size="sm"
                  className="w-full"
                  value={inviteRole}
                  onChange={(value) => setInviteRole(value as "member" | "guest")}
                  items={[{ value: "member", label: t("Bandmitglied") }, { value: "guest", label: t("Gast / Aushilfe") }]}
                />
                {inviteRole === "guest" ? (
                  <div className="space-y-1.5 rounded-xl bg-surface-2 p-3">
                    <p className="text-xs text-muted">{t("Gäste sehen nur diese Setlists mit Lead Sheets, Noten und Aufnahmen – keine Termine, Kasse oder Diskussionen.")}</p>
                    {(setlists.data?.setlists ?? []).map((setlist) => (
                      <label key={setlist.id} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={guestSetlists.includes(setlist.id)} onChange={(event) => setGuestSetlists((current) => (event.target.checked ? [...current, setlist.id] : current.filter((id) => id !== setlist.id)))} />
                        {setlist.name}
                      </label>
                    ))}
                  </div>
                ) : null}
                <div className="flex gap-2">
                  <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@email.de" required />
                  <Button type="submit" variant="primary" loading={inviting} icon={<Send />} disabled={!email.trim() || (inviteRole === "guest" && guestSetlists.length === 0)} aria-label={t("Einladen")} />
                </div>
              </form>

              <div className="mt-5 flex items-center justify-between">
                <span className="text-[13px] font-medium">{t("Einladungen")}</span>
                <button type="button" onClick={() => setShowAllInvites((value) => !value)} className="text-xs text-accent-text hover:underline">
                  {showAllInvites ? t("Nur offene") : t("Alle anzeigen")}
                </button>
              </div>
              {visibleInvites.length === 0 ? (
                <p className="mt-2 text-sm text-muted">{t("Keine offenen Einladungen.")}</p>
              ) : (
                <ul className="mt-2 space-y-1">
                  {visibleInvites.map((entry) => {
                    const state = inviteState(entry);
                    const open = state.label === "Offen" || state.label === "Abgelaufen";
                    return (
                      <li key={entry.id} className="flex items-center gap-2 rounded-xl px-2 py-2 hover:bg-surface-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm">{entry.email}</div>
                          <div className="flex items-center gap-1 text-xs text-muted">
                            <Clock className="size-3" />
                            {entry.acceptedAt ? `angenommen ${formatRelative(entry.acceptedAt)}` : t(`gültig bis ${formatDate(entry.expiresAt)}`)}
                          </div>
                        </div>
                        <Badge tone={state.tone}>{state.label}</Badge>
                        {open ? (
                          <Menu
                            trigger={({ toggle }) => <Button size="icon-sm" variant="ghost" onClick={toggle} aria-label={t("Aktionen")}><MoreHorizontal /></Button>}
                            items={[
                              { label: t("Neuen Link kopieren"), icon: <Copy />, onSelect: () => void inviteAction(entry.id, "copy") },
                              { label: t("Erneut senden"), icon: <Send />, onSelect: () => void inviteAction(entry.id, "resend") },
                              { label: t("Um 14 Tage verlängern"), icon: <RefreshCw />, onSelect: () => void inviteAction(entry.id, "extend") },
                              { type: "separator" },
                              { label: t("Widerrufen"), icon: <Trash2 />, danger: true, onSelect: () => void inviteAction(entry.id, "revoke") },
                            ]}
                          />
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          ) : (
            <Card>
              <CardHeader title={t("Mitglieder einladen")} />
              <p className="text-sm text-muted">{t("Einladungen verschicken können Owner und Admins deiner Band.")}</p>
            </Card>
          )}

          <Card>
            <CardHeader title={t("Rollen")} />
            <ul className="space-y-2 text-[13px] text-muted">
              <li><strong className="text-fg">{t("Owner")}</strong> {t("– alles, inkl. Rollen vergeben, Backup wiederherstellen, Band löschen.")}</li>
              <li><strong className="text-fg">{t("Admin")}</strong> {t("– Termine, Einladungen, Mitglieder verwalten, Songs/Setlists löschen.")}</li>
              <li><strong className="text-fg">{t("Mitglied")}</strong> {t("– Songs & Setlists anlegen und bearbeiten, zu-/absagen, diskutieren.")}</li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
