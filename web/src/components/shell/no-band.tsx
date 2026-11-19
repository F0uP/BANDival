"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, Plus } from "lucide-react";
import { useSWRConfig } from "swr";
import { api, errorMessage } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { BrandMark, Card } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/form";
import { useToast } from "@/components/ui/feedback";
import { useSession } from "@/components/providers/session";
import { t } from "@/lib/i18n";

/** Onboarding for users that are not (or no longer) in any band. */
export function NoBand() {
  const { refresh, setBandId, me } = useSession();
  const { mutate } = useSWRConfig();
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState("");
  const [invite, setInvite] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);

  const create = async () => {
    if (!name.trim()) return;
    setBusy("create");
    try {
      const result = await api.post<{ band: { id: string } }>("/api/bands", { name: name.trim() });
      await refresh();
      setBandId(result.band.id);
      await mutate(() => true);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const join = () => {
    const value = invite.trim();
    let token = value;
    try {
      const url = new URL(value);
      token = url.searchParams.get("inviteToken") ?? url.searchParams.get("token") ?? "";
    } catch {
      // plain token
    }
    if (!token) {
      toast.error(t("Bitte einen gültigen Einladungslink einfügen."));
      return;
    }
    setBusy("join");
    router.push(`/app?inviteToken=${encodeURIComponent(token)}`);
    setBusy(null);
  };

  return (
    <div className="mx-auto max-w-lg py-10">
      <div className="mb-8 text-center">
        <BrandMark className="mx-auto mb-4 size-12 rounded-2xl" />
        <h1 className="text-2xl font-semibold tracking-tight">{t("Hallo")} {me?.displayName ?? ""} 👋</h1>
        <p className="mt-2 text-sm text-muted">{t("Du bist noch in keiner Band. Gründe eine neue Band oder tritt mit einem Einladungslink bei.")}</p>
      </div>
      <div className="space-y-4">
        <Card>
          <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void create(); }}>
            <Field label={t("Neue Band gründen")}>
              {(id) => <Input id={id} value={name} onChange={(event) => setName(event.target.value)} placeholder={t("Bandname")} />}
            </Field>
            <Button type="submit" variant="primary" icon={<Plus />} loading={busy === "create"} disabled={!name.trim()} className="w-full">
              {t("Band erstellen")}
            </Button>
          </form>
        </Card>
        <Card>
          <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); join(); }}>
            <Field label={t("Einladungslink")}>
              {(id) => <Input id={id} value={invite} onChange={(event) => setInvite(event.target.value)} placeholder="https://…/app?inviteToken=…" />}
            </Field>
            <Button type="submit" icon={<Link2 />} loading={busy === "join"} disabled={!invite.trim()} className="w-full">
              {t("Einladung öffnen")}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
