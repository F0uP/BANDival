"use client";

import { Languages } from "lucide-react";
import { cn } from "@/lib/client/cn";
import { currentLocale, t } from "@/lib/i18n";
import { LOCALE_COOKIE, LOCALES, LOCALE_NAMES, type Locale } from "@/lib/i18n/core";

/** Stores the language for a year and reloads, so server-rendered parts switch as well. */
export function setLocale(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
  window.location.reload();
}

/**
 * Language switch: "compact" = DE · EN pill (landing, login), "full" = labelled options (settings).
 */
export function LanguageSwitch({ variant = "compact", className }: { variant?: "compact" | "full"; className?: string }) {
  const active = currentLocale();
  if (variant === "full") {
    return (
      <div className={cn("inline-flex rounded-full bg-fg/[0.055] p-[3px]", className)} role="radiogroup" aria-label={t("Sprache")}>
        {LOCALES.map((locale) => (
          <button
            key={locale}
            type="button"
            role="radio"
            aria-checked={locale === active}
            onClick={() => locale !== active && setLocale(locale)}
            className={cn(
              "h-8 rounded-full px-3.5 text-[13px] font-medium transition-colors",
              locale === active ? "bg-surface text-fg shadow-[0_1px_2px_rgb(0_0_0/0.1)] dark:bg-surface-3" : "text-muted hover:text-fg",
            )}
          >
            {LOCALE_NAMES[locale]}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className={cn("inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.06em]", className)} aria-label={t("Sprache")}>
      <Languages className="mr-1 size-3.5 opacity-70" aria-hidden />
      {LOCALES.map((locale, index) => (
        <span key={locale} className="inline-flex items-center gap-1">
          {index > 0 ? <span className="opacity-40">·</span> : null}
          <button
            type="button"
            onClick={() => locale !== active && setLocale(locale)}
            aria-pressed={locale === active}
            className={cn("rounded px-1 py-0.5 transition-colors", locale === active ? "text-current" : "opacity-55 hover:opacity-100")}
            title={LOCALE_NAMES[locale]}
          >
            {locale}
          </button>
        </span>
      ))}
    </div>
  );
}
