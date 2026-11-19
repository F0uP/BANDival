/*
 * Bandival i18n core (no React, no Node APIs – usable everywhere).
 *
 * The German source text is the message key ("gettext style"): `t("Neuer Song")`.
 * German needs no catalog; other languages map source → translation. Keys may contain
 * placeholders – `{0}`, `{1}` for texts built with template literals, `{name}` for explicit values –
 * so dynamic strings ("Bei 3 Terminen fehlt …", server error messages, stored notifications)
 * are translated by pattern as well.
 */

export type Locale = "de" | "en";
export type Catalog = Record<string, string>;
export type Values = Record<string, string | number | boolean | null | undefined>;

export const LOCALES: Locale[] = ["de", "en"];
export const DEFAULT_LOCALE: Locale = "de";
export const LOCALE_COOKIE = "bandival_locale";
export const LOCALE_NAMES: Record<Locale, string> = { de: "Deutsch", en: "English" };

/** BCP-47 locale for Intl (dates, numbers, currency). */
export function intlLocaleOf(locale: Locale): string {
  return locale === "en" ? "en-GB" : "de-DE";
}

export function isLocale(value: unknown): value is Locale {
  return value === "de" || value === "en";
}

/** Cookie first, then the browser's Accept-Language; other languages get English. */
export function resolveLocale(cookie: string | null | undefined, acceptLanguage: string | null | undefined): Locale {
  if (isLocale(cookie)) return cookie;
  if (!acceptLanguage) return DEFAULT_LOCALE;
  for (const part of acceptLanguage.split(",")) {
    const tag = part.split(";")[0]?.trim().toLowerCase() ?? "";
    if (tag.startsWith("de")) return "de";
    if (tag.startsWith("en")) return "en";
  }
  return "en";
}

type Template = { regex: RegExp; target: string; slots: string[] };
const PLACEHOLDER = /\{(\w+)\}/g;
const compiled = new WeakMap<Catalog, Template[]>();
const memo = new WeakMap<Catalog, Map<string, string>>();

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function templatesOf(catalog: Catalog): Template[] {
  let list = compiled.get(catalog);
  if (list) return list;
  list = [];
  for (const [key, target] of Object.entries(catalog)) {
    if (!key.includes("{")) continue;
    const slots: string[] = [];
    let pattern = "";
    let last = 0;
    for (const match of key.matchAll(PLACEHOLDER)) {
      pattern += escapeRegex(key.slice(last, match.index));
      pattern += "([\\s\\S]*?)";
      slots.push(match[1]);
      last = (match.index ?? 0) + match[0].length;
    }
    pattern += escapeRegex(key.slice(last));
    // Templates with more fixed text first – they are more specific.
    list.push({ regex: new RegExp(`^${pattern}$`), target, slots });
  }
  list.sort((a, b) => b.regex.source.length - a.regex.source.length);
  compiled.set(catalog, list);
  return list;
}

function interpolate(text: string, values?: Values): string {
  if (!values) return text;
  return text.replace(PLACEHOLDER, (whole, name: string) => (name in values && values[name] !== undefined && values[name] !== null ? String(values[name]) : whole));
}

/** Translates `text` with `catalog`; unknown texts are returned unchanged (user content stays as it is). */
export function translateWith(catalog: Catalog | null, text: string, values?: Values): string {
  if (!catalog || !text) return interpolate(text, values);
  const direct = catalog[text];
  if (direct !== undefined) return interpolate(direct, values);
  if (values) return interpolate(text, values);

  let cache = memo.get(catalog);
  if (!cache) {
    cache = new Map();
    memo.set(catalog, cache);
  }
  const cached = cache.get(text);
  if (cached !== undefined) return cached;

  let result = text;
  // Surrounding whitespace / punctuation-only differences are tolerated.
  const trimmed = text.trim();
  if (trimmed !== text && catalog[trimmed] !== undefined) {
    result = text.replace(trimmed, catalog[trimmed]);
  } else if (/\S\s|\d/.test(text)) {
    for (const template of templatesOf(catalog)) {
      const match = template.regex.exec(text);
      if (!match) continue;
      const captured: Record<string, string> = {};
      template.slots.forEach((slot, index) => {
        const value = match[index + 1] ?? "";
        // Embedded fixed texts (labels, statuses) are translated too; user content stays.
        captured[slot] = catalog[value] ?? value;
      });
      result = template.target.replace(PLACEHOLDER, (whole, name: string) => captured[name] ?? whole);
      break;
    }
  }
  if (cache.size > 5000) cache.clear();
  cache.set(text, result);
  return result;
}
