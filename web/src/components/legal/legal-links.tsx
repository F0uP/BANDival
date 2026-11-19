"use client";

import Link from "next/link";
import { CookieSettingsLink } from "@/components/legal/cookie-banner";
import { cn } from "@/lib/client/cn";
import { t } from "@/lib/i18n";

/** Imprint · privacy · terms · cookie settings – for page footers. */
export function LegalLinks({ className }: { className?: string }) {
  return (
    <nav aria-label={t("Rechtliches")} className={cn("flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-muted", className)}>
      <Link href="/impressum" className="hover:text-fg">{t("Impressum")}</Link>
      <Link href="/datenschutz" className="hover:text-fg">{t("Datenschutz")}</Link>
      <Link href="/agb" className="hover:text-fg">{t("AGB")}</Link>
      <CookieSettingsLink className="hover:text-fg" />
    </nav>
  );
}
