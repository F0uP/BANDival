import { AsyncLocalStorage } from "node:async_hooks";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { LOCALE_COOKIE, resolveLocale, type Locale, type Values } from "@/lib/i18n/core";
import { activateLocale, translateFor } from "@/lib/i18n";

// Per-request language store used by t() while client components are rendered on the server.
globalThis.__bandivalI18n ??= new AsyncLocalStorage<{ locale: Locale }>();

/** Language of the current request (cookie → Accept-Language → German). */
export const getLocale = cache(async (): Promise<Locale> => {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  return resolveLocale(cookieStore.get(LOCALE_COOKIE)?.value, headerStore.get("accept-language"));
});

/** `t` for server components and route handlers. */
export async function getT(): Promise<(text: string, values?: Values) => string> {
  const locale = await getLocale();
  activateLocale(locale);
  return (text: string, values?: Values) => translateFor(locale, text, values);
}

/** Language for API responses (no `server-only` restriction on request objects). */
export function localeFromRequest(request: { headers: Headers; cookies?: { get(name: string): { value: string } | undefined } }): Locale {
  return resolveLocale(request.cookies?.get(LOCALE_COOKIE)?.value ?? null, request.headers.get("accept-language"));
}
