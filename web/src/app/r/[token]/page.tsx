import type { Metadata } from "next";
import Link from "next/link";
import { Clock, FileDown, Mail, MapPin } from "lucide-react";
import { loadSharedRider } from "@/lib/rider-share";
import { BrandMark } from "@/components/ui/display";
import { LanguageSwitch } from "@/components/i18n/language-switch";
import { LegalLinks } from "@/components/legal/legal-links";
import { getLocale, getT } from "@/lib/i18n/server";
import { intlLocaleOf } from "@/lib/i18n/core";
import { I18nProvider } from "@/components/providers/i18n";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await getT();
  const shared = await loadSharedRider((await params).token);
  return {
    title: shared ? t("Tech-Rider · {band}", { band: shared.bandName }) : t("Link ungültig"),
    robots: { index: false, follow: false },
  };
}

/** Rider for venue technicians: channel list, monitor mixes, stage plot and the gig's times – no login. */
export default async function SharedRiderPage({ params }: Props) {
  const { token } = await params;
  const [shared, t, locale] = await Promise.all([loadSharedRider(token), getT(), getLocale()]);
  const intl = intlLocaleOf(locale);

  if (!shared) {
    return (
      <I18nProvider locale={locale}>
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <BrandMark className="size-10 rounded-[11px]" />
        <h1 className="type-display text-[28px]">{t("Link ungültig")}</h1>
        <p className="text-muted">{t("Dieser Rider-Link ist abgelaufen oder wurde von der Band zurückgezogen. Bitte frag bei der Band nach einem neuen.")}</p>
      </main>
      </I18nProvider>
    );
  }

  const { rider, event } = shared;
  const zone = shared.timezone;
  const time = (value: Date | null) => (value ? value.toLocaleTimeString(intl, { timeZone: zone, hour: "2-digit", minute: "2-digit" }) : null);
  const schedule = event
    ? ([
        [t("Load-in"), time(event.loadInAt)],
        [t("Soundcheck"), time(event.soundcheckAt)],
        [t("Einlass"), time(event.doorsAt)],
        [t("Beginn"), time(event.startsAt)],
        [t("Ende"), time(event.endsAt)],
      ].filter(([, value]) => value) as Array<[string, string]>)
    : [];

  // Async page: its content streams later – re-activate the language for the client components in it.
  return (
    <I18nProvider locale={locale}>
    <div className="min-h-dvh bg-bg">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 pt-6">
        <span className="inline-flex items-center gap-2.5">
          <BrandMark className="size-8 rounded-[9px]" />
          <span className="type-eyebrow text-muted">{t("Tech-Rider")}</span>
        </span>
        <LanguageSwitch className="text-muted" />
      </header>

      <main className="page-enter mx-auto max-w-5xl px-5 pb-16 pt-10">
        <p className="type-eyebrow text-muted">{event ? event.startsAt.toLocaleDateString(intl, { timeZone: zone, weekday: "long", day: "numeric", month: "long", year: "numeric" }) : t("Allgemeiner Rider")}</p>
        <h1 className="type-display mt-2 text-[40px] leading-[1.02] sm:text-[56px]">{shared.bandName}</h1>
        {event ? (
          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-muted">
            <span className="font-medium text-fg">{event.title}</span>
            {event.venue ? <span className="inline-flex items-center gap-1.5"><MapPin className="size-4" />{event.venue}</span> : null}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-2">
          <a href={`/api/public/rider/${token}`} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-full bg-fg px-[18px] text-sm font-medium text-bg"><FileDown className="size-4" />{t("Rider als PDF")}</a>
          {shared.contactEmail ? <a href={`mailto:${shared.contactEmail}`} className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-[18px] text-sm font-medium"><Mail className="size-4" />{shared.contactEmail}</a> : null}
        </div>

        {schedule.length > 0 ? (
          <section className="mt-10">
            <h2 className="type-eyebrow mb-3 flex items-center gap-2 text-muted"><Clock className="size-3.5" />{t("Ablauf")}</h2>
            <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {schedule.map(([label, value]) => (
                <li key={label} className="rounded-2xl border border-border bg-surface px-4 py-3">
                  <span className="type-meta block text-[11px] text-muted">{label}</span>
                  <span className="type-display text-[26px] tabular-nums">{value}</span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <section className="rounded-[20px] border border-border bg-surface p-5">
            <h2 className="mb-3 text-[17px] font-semibold">{t("Kanalliste")}</h2>
            {rider.inputs.length === 0 ? <p className="text-sm text-muted">{t("Keine Kanäle eingetragen.")}</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="type-meta text-[11px] text-muted">
                    <tr><th className="py-1.5 pr-3">{t("Ch")}</th><th className="py-1.5 pr-3">{t("Quelle")}</th><th className="py-1.5 pr-3">{t("Mikro / DI")}</th><th className="py-1.5 pr-3">{t("Stativ")}</th><th className="py-1.5">{t("Notiz")}</th></tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rider.inputs.map((input) => (
                      <tr key={input.channel}>
                        <td className="py-2 pr-3 font-mono tabular-nums text-muted">{input.channel}</td>
                        <td className="py-2 pr-3 font-medium">{input.source}</td>
                        <td className="py-2 pr-3">{input.mic}</td>
                        <td className="py-2 pr-3 text-muted">{input.stand}</td>
                        <td className="py-2 text-muted">{input.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-[20px] border border-border bg-surface p-5">
            <h2 className="mb-3 text-[17px] font-semibold">{t("Monitormixe")}</h2>
            {rider.monitors.length === 0 ? <p className="text-sm text-muted">{t("Noch keine Monitormixe.")}</p> : (
              <ul className="divide-y divide-border text-sm">
                {rider.monitors.map((monitor) => (
                  <li key={monitor.mix} className="flex gap-3 py-2">
                    <span className="font-mono tabular-nums text-muted">{t("Mix")} {monitor.mix}</span>
                    <span className="min-w-0 flex-1"><span className="font-medium">{monitor.who}</span>{monitor.notes ? <span className="block text-muted">{monitor.notes}</span> : null}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {rider.stagePlot.length > 0 ? (
          <section className="mt-6 rounded-[20px] border border-border bg-surface p-5">
            <h2 className="mb-3 flex items-baseline justify-between text-[17px] font-semibold">
              {t("Stage-Plot")}
              {rider.stageWidth && rider.stageDepth ? <span className="type-meta text-[11px] font-normal text-muted">{rider.stageWidth} × {rider.stageDepth} m</span> : null}
            </h2>
            <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl border border-dashed border-border bg-bg">
              <span className="type-meta absolute inset-x-0 top-2 text-center text-[10px] text-subtle">{t("Bühnenrückwand")}</span>
              <span className="type-meta absolute inset-x-0 bottom-2 text-center text-[10px] text-subtle">{t("Publikum")}</span>
              {rider.stagePlot.map((item) => (
                <span
                  key={item.id}
                  className="absolute -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-surface px-2 py-1 text-[11px] font-medium shadow-sm"
                  style={{ left: `${item.x}%`, top: `${item.y}%` }}
                >
                  {item.label}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        <div className="mt-6 grid gap-6 md:grid-cols-3">
          {([[t("Backline"), rider.backline], [t("Hospitality"), rider.hospitality], [t("Sonstiges"), rider.notes]] as Array<[string, string]>)
            .filter(([, value]) => value.trim())
            .map(([label, value]) => (
              <section key={label} className="rounded-[20px] border border-border bg-surface p-5">
                <h2 className="mb-2 text-[15px] font-semibold">{label}</h2>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">{value}</p>
              </section>
            ))}
        </div>
      </main>

      <footer className="border-t border-border py-8 text-center text-sm text-muted">
        <Link href="/" className="inline-flex items-center gap-2 hover:text-fg"><BrandMark className="size-5 rounded-[6px]" /> {t("Erstellt mit Bandival")}</Link>
        <LegalLinks className="mt-4 justify-center text-xs" />
      </footer>
    </div>
    </I18nProvider>
  );
}
