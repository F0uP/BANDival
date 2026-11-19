"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Cookie } from "lucide-react";
import { Button } from "@/components/ui/button";
import { onConsentSettingsRequested, openConsentSettings, setConsent, useConsent, type ConsentChoice } from "@/lib/client/consent";
import { t } from "@/lib/i18n";

/**
 * Cookie notice. Shown until a choice was made (and again via "Cookie-Einstellungen").
 * Both choices are equally prominent; nothing optional is loaded before a choice.
 */
export function CookieBanner({ enabled, initial }: { enabled: boolean; initial: ConsentChoice | null }) {
  const consent = useConsent(initial);
  const pathname = usePathname();
  const [reopened, setReopened] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => onConsentSettingsRequested(() => { setLeaving(false); setReopened(true); }), []);

  // Never pops up uninvited in the stage view – it would cover the lead sheet mid-show.
  const onStage = /\/stage(\/|$)/.test(pathname ?? "");
  const visible = reopened || (enabled && consent === null && !onStage);
  if (!visible) return null;

  const choose = (choice: ConsentChoice) => {
    setConsent(choice);
    setLeaving(true);
    window.setTimeout(() => { setReopened(false); setLeaving(false); }, 220);
  };

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-banner-title"
      className={`fixed inset-x-3 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-[70] mx-auto max-w-[26rem] rounded-[20px] border border-border bg-surface p-5 shadow-[var(--shadow-float)] sm:inset-x-auto sm:left-5 lg:bottom-5 ${leaving ? "opacity-0 transition-opacity duration-200" : "[animation:rise-in_520ms_var(--ease-out)]"}`}
    >
      <p id="cookie-banner-title" className="type-eyebrow flex items-center gap-2 text-muted">
        <Cookie className="size-3.5" aria-hidden /> {t("Cookies & externe Inhalte")}
      </p>
      <p className="mt-3 text-[14px] leading-relaxed text-fg/85">
        {t("Bandival verwendet nur technisch notwendige Cookies – für Anmeldung, Sicherheit und Sprache. Externe Player wie Spotify oder YouTube laden wir erst, wenn du es erlaubst.")}
      </p>
      {consent ? (
        <p className="mt-2 text-xs text-muted">
          {t("Aktuelle Auswahl:")} <strong className="font-medium text-fg">{consent === "media" ? t("Externe Medien erlaubt") : t("Nur notwendige")}</strong>
        </p>
      ) : null}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="secondary" size="sm" onClick={() => choose("necessary")}>{t("Nur notwendige")}</Button>
        <Button variant="secondary" size="sm" onClick={() => choose("media")}>{t("Externe Medien erlauben")}</Button>
      </div>
      <p className="mt-3 flex gap-3 text-xs text-muted">
        <Link href="/datenschutz" className="hover:text-fg hover:underline">{t("Datenschutz")}</Link>
        <Link href="/impressum" className="hover:text-fg hover:underline">{t("Impressum")}</Link>
      </p>
    </section>
  );
}

/** Small link that reopens the notice – for footers and the privacy page. */
export function CookieSettingsLink({ className }: { className?: string }) {
  return (
    <button type="button" className={className} onClick={openConsentSettings}>
      {t("Cookie-Einstellungen")}
    </button>
  );
}
