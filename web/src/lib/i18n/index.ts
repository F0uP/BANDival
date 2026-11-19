import en from "@/i18n/en.json";
import { DEFAULT_LOCALE, intlLocaleOf, translateWith, type Catalog, type Locale, type Values } from "@/lib/i18n/core";

/*
 * `t()` for components (client components and shared modules).
 * The active language is set once per page by <I18nProvider> (client) – during server rendering
 * it is kept per request in an AsyncLocalStorage created by the server, so concurrent requests
 * in different languages never mix.
 */

const CATALOGS: Record<Locale, Catalog | null> = { de: null, en: en as Catalog };

type Store = { locale: Locale };
type RequestStorage = { getStore(): Store | undefined; enterWith(store: Store): void };

declare global {
  var __bandivalI18n: RequestStorage | undefined;
}

let clientLocale: Locale = DEFAULT_LOCALE;

/** Called by <I18nProvider> (browser) and per request during server rendering. */
export function activateLocale(locale: Locale): void {
  if (typeof window === "undefined") {
    globalThis.__bandivalI18n?.enterWith({ locale });
    return;
  }
  clientLocale = locale;
  document.documentElement.lang = locale;
}

export function currentLocale(): Locale {
  if (typeof window === "undefined") return globalThis.__bandivalI18n?.getStore()?.locale ?? DEFAULT_LOCALE;
  return clientLocale;
}

/** Locale for Intl formatting ("de-DE" / "en-GB"). */
export function intlLocale(): string {
  return intlLocaleOf(currentLocale());
}

/** Translates a (German) UI text into the active language. */
export function t(text: string, values?: Values): string {
  return translateWith(CATALOGS[currentLocale()], text, values);
}

export function translateFor(locale: Locale, text: string, values?: Values): string {
  return translateWith(CATALOGS[locale], text, values);
}

const proxies = new WeakMap<object, object>();

/**
 * Label tables and option lists defined at module level are translated when they are read
 * (the language is not known yet when the module is loaded).
 */
export function translatable<T extends object>(value: T): T {
  const existing = proxies.get(value);
  if (existing) return existing as T;
  const proxy = new Proxy(value, {
    get(target, property, receiver) {
      const result = Reflect.get(target, property, receiver);
      if (typeof result === "string") return t(result);
      if (result && typeof result === "object" && !("$$typeof" in result) && !(result instanceof Date)) return translatable(result);
      return result;
    },
  });
  proxies.set(value, proxy);
  return proxy;
}
