"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { useSWRConfig } from "swr";
import { Users } from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/feedback";
import { useSession } from "@/components/providers/session";

type Preview = { valid: boolean; bandName?: string; email?: string; invitedBy?: string };

/** Picks up `?inviteToken=` links (from invitation e-mails) and offers to join the band. */
export function InviteHandler() {
  const params = useSearchParams();
  const token = params.get("inviteToken") ?? params.get("token");
  const router = useRouter();
  const toast = useToast();
  const { me, refresh, setBandId } = useSession();
  const { mutate } = useSWRConfig();
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { data: preview } = useSWR<Preview>(token ? `/api/band-invites/preview?token=${encodeURIComponent(token)}` : null);

  const clearParam = () => {
    setDismissed(token);
    const url = new URL(window.location.href);
    url.searchParams.delete("inviteToken");
    url.searchParams.delete("token");
    router.replace(url.pathname + (url.search ? url.search : ""));
  };

  const accept = async () => {
    if (!token) return;
    setBusy(true);
    try {
      const result = await api.post<{ bandId: string; bandName: string }>("/api/band-invites/accept", { token });
      await refresh();
      setBandId(result.bandId);
      await mutate(() => true);
      toast.success(`Willkommen bei ${result.bandName}!`);
      clearParam();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const open = Boolean(token && me && preview && dismissed !== token);
  const alreadyMember = Boolean(preview?.bandName && me?.bands.some((band) => band.name === preview.bandName) && !preview.valid);

  return (
    <Dialog
      open={open}
      onClose={clearParam}
      size="sm"
      title={preview?.valid ? `Einladung zu ${preview.bandName}` : "Einladung nicht mehr gültig"}
      footer={preview?.valid ? (
        <>
          <Button onClick={clearParam}>Später</Button>
          <Button variant="primary" loading={busy} onClick={() => void accept()}>Band beitreten</Button>
        </>
      ) : (
        <Button variant="primary" onClick={clearParam}>Verstanden</Button>
      )}
    >
      {preview?.valid ? (
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-text"><Users className="size-5" /></span>
          <p className="text-sm text-muted">
            {preview.invitedBy ? `${preview.invitedBy} hat dich` : "Du wurdest"} eingeladen, der Band <strong className="text-fg">{preview.bandName}</strong> beizutreten.
            {preview.email && me && preview.email !== me.email ? (
              <span className="mt-2 block text-warning">
                Die Einladung ging an {preview.email} – du bist als {me.email} angemeldet. Bitte melde dich mit der eingeladenen Adresse an.
              </span>
            ) : null}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted">
          {alreadyMember
            ? "Du bist bereits Mitglied dieser Band."
            : "Der Link ist abgelaufen, wurde widerrufen oder bereits verwendet. Bitte frag nach einer neuen Einladung."}
        </p>
      )}
    </Dialog>
  );
}
