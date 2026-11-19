import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BrandMark } from "@/components/ui/display";
import { LanguageSwitch } from "@/components/i18n/language-switch";
import { CookieSettingsLink } from "@/components/legal/cookie-banner";
import { LegalMarkdown } from "@/components/legal/markdown";
import { getLegalContent, LEGAL_PAGES, type LegalSlug } from "@/lib/legal";
import { getLocale, getT } from "@/lib/i18n/server";
import { intlLocaleOf } from "@/lib/i18n/core";
import { I18nProvider } from "@/components/providers/i18n";

/** Public legal page (imprint, privacy policy, terms) – reachable without an account. */
export async function LegalPage({ slug }: { slug: LegalSlug }) {
  const [page, t, locale] = await Promise.all([getLegalContent(slug), getT(), getLocale()]);
  const updated = page.updatedAt ? new Date(page.updatedAt).toLocaleDateString(intlLocaleOf(locale), { dateStyle: "long" }) : null;

  // Async page: its content streams later – re-activate the language for the client components in it.
  return (
    <I18nProvider locale={locale}>
    <div className="min-h-dvh bg-bg">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 pt-6 sm:pt-10">
        <Link href="/" className="inline-flex items-center gap-2.5">
          <BrandMark className="size-8 rounded-[9px]" />
          <span className="type-display text-[19px]">Bandival</span>
        </Link>
        <LanguageSwitch className="text-muted" />
      </header>

      <main className="page-enter mx-auto max-w-3xl px-5 pb-20 pt-10 sm:pt-16">
        <Link href="/" className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
          <ArrowLeft className="size-4" /> {t("Zur Startseite")}
        </Link>
        {locale !== "de" ? (
          <p className="mb-8 rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-muted">
            {t("Dieser Text ist nur auf Deutsch verfügbar.")}
          </p>
        ) : null}
        <article lang="de">
          <LegalMarkdown source={page.content} />
        </article>
        {updated ? <p className="type-meta mt-12 text-subtle">{t("Zuletzt aktualisiert: {date}", { date: updated })}</p> : null}
      </main>

      <footer className="border-t border-border">
        <nav className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-8 text-sm text-muted" aria-label={t("Rechtliches")}>
          {LEGAL_PAGES.map((item) => (
            <Link key={item.slug} href={`/${item.slug}`} aria-current={item.slug === slug ? "page" : undefined} className={item.slug === slug ? "text-fg" : "hover:text-fg"}>
              {t(item.title)}
            </Link>
          ))}
          <CookieSettingsLink className="hover:text-fg" />
        </nav>
      </footer>
    </div>
    </I18nProvider>
  );
}
