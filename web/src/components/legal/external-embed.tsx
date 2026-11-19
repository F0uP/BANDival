"use client";

import { useState } from "react";
import { PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setConsent, useConsent } from "@/lib/client/consent";
import { t } from "@/lib/i18n";

/**
 * iframe from an external provider behind a two-click gate: nothing is requested from the provider
 * until the person agrees once (or has allowed external media in the cookie notice).
 */
export function ExternalEmbed({ src, title, provider, className }: { src: string; title: string; provider: string; className?: string }) {
  const consent = useConsent();
  const [once, setOnce] = useState(false);
  const [remember, setRemember] = useState(false);

  if (consent === "media" || once) {
    return (
      <iframe
        src={src}
        title={title}
        className={className}
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"
      />
    );
  }

  return (
    <div className={`flex flex-col items-start justify-center gap-3 bg-surface-2 p-5 ${className ?? ""}`}>
      <p className="flex items-center gap-2 text-sm font-semibold"><PlayCircle className="size-4 text-accent-text" /> {t("{provider}-Player laden?", { provider })}</p>
      <p className="text-xs leading-relaxed text-muted">{t("Dabei werden Daten an {provider} übertragen und ggf. Cookies gesetzt.", { provider })}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="secondary" onClick={() => { if (remember) setConsent("media"); setOnce(true); }}>{t("Player laden")}</Button>
        <label className="inline-flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} className="accent-[var(--accent)]" />
          {t("Entscheidung merken")}
        </label>
      </div>
    </div>
  );
}
