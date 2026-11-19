"use client";

import { useState } from "react";
import { LogOut, MailCheck, RefreshCw, Send } from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import type { Me } from "@/lib/client/types";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/ui/display";
import { useToast } from "@/components/ui/feedback";
import { useSession } from "@/components/providers/session";
import { t } from "@/lib/i18n";

/** Shown instead of the app while the e-mail address of a new account is not confirmed (only with SMTP). */
export function VerifyEmailGate() {
  const { me, refresh, logout } = useSession();
  const toast = useToast();
  const [busy, setBusy] = useState<"send" | "check" | null>(null);
  if (!me) return null;

  const resend = async () => {
    setBusy("send");
    try {
      const result = await api.post<{ ok: boolean; alreadyVerified?: boolean }>("/api/account/verify-email");
      if (result.alreadyVerified) await refresh();
      else toast.success(t(`Neuer Bestätigungslink an ${me.email} ist unterwegs.`));
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const check = async () => {
    setBusy("check");
    const result = (await refresh()) as { user?: Me } | undefined;
    setBusy(null);
    if (result?.user && !result.user.emailVerificationRequired) return;
    toast.info(t("Noch nicht bestätigt – schau auch im Spam-Ordner nach."));
  };

  return (
    <div className="flex min-h-dvh items-center justify-center px-5 py-12">
      <div className="w-full max-w-md text-center [animation:rise-in_600ms_var(--ease-out)]">
        <BrandMark className="mx-auto size-10 rounded-[11px]" />
        <div className="relative mx-auto mt-12 flex size-20 items-center justify-center">
          <span className="absolute inset-0 rounded-full border border-accent/40 [animation:ripple_2.6s_var(--ease-out)_infinite]" />
          <span className="absolute inset-0 rounded-full border border-accent/40 [animation:ripple_2.6s_var(--ease-out)_1.3s_infinite]" />
          <span className="relative flex size-20 items-center justify-center rounded-full bg-accent-soft text-accent-text"><MailCheck className="size-8" /></span>
        </div>
        <h1 className="type-display mt-9 text-[34px] sm:text-[40px]">{t("Bestätige deine E-Mail-Adresse")}</h1>
        <p className="mt-4 text-[15px] leading-relaxed text-muted">
          {t("Wir haben einen Link an")} <strong className="font-semibold text-fg">{me.email}</strong> {t("geschickt. Ein Klick darauf schaltet deinen Account frei.")}
        </p>
        <div className="mt-9 flex flex-col gap-2">
          <Button variant="primary" size="lg" loading={busy === "check"} icon={<RefreshCw />} onClick={() => void check()}>{t("Ich habe bestätigt")}</Button>
          <Button size="lg" loading={busy === "send"} icon={<Send />} onClick={() => void resend()}>{t("Link erneut senden")}</Button>
          <Button variant="ghost" icon={<LogOut />} onClick={() => void logout()}>{t("Abmelden")}</Button>
        </div>
      </div>
    </div>
  );
}
