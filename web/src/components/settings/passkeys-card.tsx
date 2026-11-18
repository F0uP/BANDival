"use client";

import { useState, useSyncExternalStore } from "react";
import useSWR from "swr";
import { Fingerprint, KeyRound, Pencil, Plus, Trash2 } from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import { formatRelative } from "@/lib/client/format";
import { addPasskey, passkeyErrorMessage, passkeysSupported } from "@/lib/client/passkeys";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/display";
import { useConfirm, useToast } from "@/components/ui/feedback";

type PasskeyRow = { id: string; name: string; deviceType: string | null; backedUp: boolean; createdAt: string; lastUsedAt: string | null };

const subscribe = () => () => undefined;

/** Passkeys of the account: sign in with fingerprint, face or device PIN – no password, phishing-proof. */
export function PasskeysCard() {
  const { data, mutate } = useSWR<{ passkeys: PasskeyRow[]; hasPassword: boolean }>("/api/account/passkeys");
  const supported = useSyncExternalStore(subscribe, passkeysSupported, () => false);
  const [adding, setAdding] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();
  const passkeys = data?.passkeys ?? [];

  const add = async () => {
    setAdding(true);
    try {
      await addPasskey();
      await mutate();
      toast.success("Passkey hinzugefügt – ab jetzt kannst du dich damit anmelden.");
    } catch (error) {
      toast.error(passkeyErrorMessage(error));
    } finally {
      setAdding(false);
    }
  };

  const rename = async (passkey: PasskeyRow) => {
    const name = await confirm({ title: "Passkey umbenennen", confirmLabel: "Speichern", input: { defaultValue: passkey.name } });
    if (typeof name !== "string" || !name.trim()) return;
    await api.patch(`/api/account/passkeys/${passkey.id}`, { name: name.trim() }).catch((error) => toast.error(errorMessage(error)));
    await mutate();
  };

  const remove = async (passkey: PasskeyRow) => {
    const ok = await confirm({ title: `„${passkey.name}“ entfernen?`, description: "Mit diesem Passkey kannst du dich danach nicht mehr anmelden.", confirmLabel: "Entfernen", tone: "danger" });
    if (!ok) return;
    try {
      await api.delete(`/api/account/passkeys/${passkey.id}`);
      await mutate();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium"><Fingerprint className="size-4 text-muted" />Passkeys</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">
            Anmelden mit Fingerabdruck, Gesichtserkennung oder Geräte-PIN – ohne Passwort und sicher gegen Phishing. Zählt als Zwei-Faktor-Anmeldung.
          </p>
        </div>
        {supported ? <Button size="sm" icon={<Plus />} loading={adding} onClick={() => void add()}>Passkey hinzufügen</Button> : null}
      </div>
      {!supported ? <p className="mt-3 rounded-[10px] bg-fg/[0.04] px-3 py-2 text-xs text-muted">Dieser Browser unterstützt keine Passkeys – oder Bandival läuft nicht über https.</p> : null}
      {data && !data.hasPassword ? <p className="mt-3 rounded-[10px] bg-accent-soft px-3 py-2 text-xs text-accent-text">Dein Account hat kein Passwort – du meldest dich nur mit Passkeys an.</p> : null}
      {passkeys.length ? (
        <ul className="mt-4 divide-y divide-border rounded-[12px] border border-border">
          {passkeys.map((passkey) => (
            <li key={passkey.id} className="flex items-center gap-3 px-3 py-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-fg/[0.06]"><KeyRound className="size-4" /></span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  <span className="truncate">{passkey.name}</span>
                  {passkey.backedUp ? <Badge tone="success">Synchronisiert</Badge> : null}
                </span>
                <span className="type-meta block text-[11px] text-subtle">
                  angelegt {formatRelative(passkey.createdAt)}{passkey.lastUsedAt ? ` · zuletzt ${formatRelative(passkey.lastUsedAt)}` : ""}
                </span>
              </span>
              <Button size="icon-sm" variant="ghost" icon={<Pencil />} aria-label="Umbenennen" onClick={() => void rename(passkey)} />
              <Button size="icon-sm" variant="ghost" icon={<Trash2 />} aria-label="Entfernen" onClick={() => void remove(passkey)} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
