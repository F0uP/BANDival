"use client";

import type { ReactNode } from "react";
import { activateLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/core";

/**
 * Activates the language for everything rendered below – before the children render, both in the
 * browser and during server rendering (per request), so texts and dates match on hydration.
 */
export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  activateLocale(locale);
  return children;
}
