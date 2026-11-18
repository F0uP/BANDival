"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { useSWRConfig } from "swr";
import { api, errorMessage } from "@/lib/client/api";
import { cn } from "@/lib/client/cn";
import { ROLE_LABELS } from "@/lib/permissions";
import { Menu } from "@/components/ui/navigation";
import { useConfirm, useToast } from "@/components/ui/feedback";
import { useSession } from "@/components/providers/session";

export function BandSwitcher({ compact = false }: { compact?: boolean }) {
  const { me, band, setBandId, refresh } = useSession();
  const confirm = useConfirm();
  const toast = useToast();
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const [busy, setBusy] = useState(false);

  if (!me || !band) {
    return null;
  }

  const switchTo = (bandId: string) => {
    setBandId(bandId);
    router.push("/app");
  };

  const createBand = async () => {
    const name = await confirm({
      title: "Neue Band gründen",
      description: "Du wirst Owner der neuen Band und kannst danach Mitglieder einladen.",
      confirmLabel: "Band erstellen",
      input: { label: "Bandname", placeholder: "z. B. The Midnight Rehearsals" },
    });
    if (typeof name !== "string" || !name.trim()) return;
    setBusy(true);
    try {
      const result = await api.post<{ band: { id: string } }>("/api/bands", { name: name.trim() });
      await refresh();
      await mutate(() => true);
      switchTo(result.band.id);
      toast.success(`„${name.trim()}“ wurde erstellt.`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Menu
      align="start"
      className={compact ? "min-w-0" : "w-full"}
      trigger={({ toggle, open }) => (
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          aria-expanded={open}
          className={cn(
            "flex min-w-0 items-center gap-2.5 text-left transition-colors",
            compact ? "rounded-full px-1.5 py-1 hover:bg-fg/[0.05]" : "w-full rounded-[12px] border border-border bg-surface px-2.5 py-2 hover:border-border-strong",
          )}
        >
          <span className="type-display flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-ink text-[16px] text-ink-fg">
            {band.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{band.name}</span>
            {!compact ? <span className="block truncate font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted">{ROLE_LABELS[band.role]}</span> : null}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted" />
        </button>
      )}
      items={[
        { type: "label", label: "Deine Bands" },
        ...me.bands.map((entry) => ({
          label: entry.name,
          icon: entry.id === band.id ? <Check /> : <span className="inline-block size-4" />,
          hint: ROLE_LABELS[entry.role],
          onSelect: () => switchTo(entry.id),
        })),
        { type: "separator" as const },
        { label: "Neue Band gründen", icon: <Plus />, onSelect: () => void createBand() },
      ]}
    />
  );
}
