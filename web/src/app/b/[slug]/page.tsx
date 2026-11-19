import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, CalendarPlus, Mail, MapPin, Music2 } from "lucide-react";
import { loadPublicBand } from "@/lib/public-band";
import { SOCIAL_PLATFORMS, spotifyEmbed } from "@/lib/social-links";
import { BrandMark } from "@/components/ui/display";
import { SocialIcon } from "@/components/public/social-icon";
import { SpotifyPlayer } from "@/components/public/spotify-player";
import { getLocale, getT } from "@/lib/i18n/server";
import { intlLocaleOf } from "@/lib/i18n/core";
import { LegalLinks } from "@/components/legal/legal-links";
import { I18nProvider } from "@/components/providers/i18n";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await loadPublicBand((await params).slug);
  const t = await getT();
  if (!data) return { title: t("Nicht gefunden") };
  const description = (data.band.bio ?? data.band.description ?? t("{name} – Konzerte, Musik & Kontakt", { name: data.band.name })).slice(0, 160);
  const image = data.band.pressPhotoUrl ? `/api/public/bands/${data.band.slug}/photo` : undefined;
  return {
    title: data.band.name,
    description,
    openGraph: { title: data.band.name, description, images: image ? [image] : undefined, type: "profile" },
    robots: { index: true, follow: true },
  };
}

function formatDuration(seconds: number | null): string {
  return seconds ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : "";
}

const PLATFORM_ORDER = SOCIAL_PLATFORMS.map((platform) => platform.kind);

export default async function PublicBandPage({ params }: Props) {
  const data = await loadPublicBand((await params).slug);
  if (!data) notFound();
  const { band, gigs, songs } = data;
  const zone = band.timezone;
  const t = await getT();
  const intl = intlLocaleOf(await getLocale());
  const day = new Intl.DateTimeFormat(intl, { timeZone: zone, day: "numeric" });
  const month = new Intl.DateTimeFormat(intl, { timeZone: zone, month: "short" });
  const weekday = new Intl.DateTimeFormat(intl, { timeZone: zone, weekday: "short" });
  const year = new Intl.DateTimeFormat(intl, { timeZone: zone, year: "numeric" });
  const time = new Intl.DateTimeFormat(intl, { timeZone: zone, hour: "2-digit", minute: "2-digit" });
  const bio = band.bio ?? band.description;

  const social = band.links
    .filter((link) => PLATFORM_ORDER.includes(link.kind))
    .sort((a, b) => PLATFORM_ORDER.indexOf(a.kind) - PLATFORM_ORDER.indexOf(b.kind));
  const merch = band.links.find((link) => link.kind === "merch");
  const player = band.links.find((link) => link.kind === "player" && spotifyEmbed(link.url));
  const custom = band.links.filter((link) => link.kind === "custom");
  const tracks = songs
    .filter((song) => spotifyEmbed(song.spotifyUrl)?.type === "track")
    .map((song) => ({ id: song.id, title: song.title, url: song.spotifyUrl as string }));
  const showPlayer = Boolean(player) || tracks.length > 0;

  // Async pages stream their content later – re-activate the language there (see I18nProvider).
  return (
    <I18nProvider locale={await getLocale()}>
    <main className="min-h-dvh bg-bg text-fg">
      <section className="theme-dark relative isolate overflow-hidden bg-[#07090c] text-fg">
        {band.pressPhotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- served by our own public route
          <img src={`/api/public/bands/${band.slug}/photo`} alt={t("Pressefoto {name}", { name: band.name })} className="absolute inset-0 -z-10 size-full object-cover opacity-45" />
        ) : (
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(60%_70%_at_30%_0%,rgb(255_255_255/0.09),transparent_70%),radial-gradient(50%_60%_at_90%_100%,rgb(255_98_36/0.16),transparent_70%)]" />
        )}
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#07090c]/30 via-[#07090c]/55 to-[#07090c]" />
        <div className="mx-auto max-w-4xl px-5 pb-14 pt-28 sm:px-8 sm:pb-20 sm:pt-40">
          {band.genre || band.city ? <p className="type-eyebrow text-muted [animation:rise-in_700ms_var(--ease-out)_both]">{[band.genre, band.city].filter(Boolean).join(" · ")}</p> : null}
          <h1 className="type-display mt-4 text-[56px] leading-[0.92] sm:text-[104px] [animation:rise-in_800ms_var(--ease-out)_80ms_both]">{band.name}</h1>
          {social.length || merch || custom.length ? (
            <div className="mt-9 flex flex-wrap items-center gap-2.5 [animation:rise-in_800ms_var(--ease-out)_180ms_both]">
              {social.map((link) => (
                <a
                  key={link.url}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={link.label}
                  title={link.label}
                  className="flex size-11 items-center justify-center rounded-full border border-white/15 bg-white/[0.05] text-fg backdrop-blur transition-[background-color,border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-white/30 hover:bg-white/10"
                >
                  <SocialIcon kind={link.kind} />
                </a>
              ))}
              {merch ? (
                <a href={merch.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-accent-fg transition-[background-color,transform] duration-200 hover:-translate-y-0.5 hover:bg-accent-hover">
                  <SocialIcon kind="merch" className="size-4" />
                  {merch.label}
                </a>
              ) : null}
              {custom.map((link) => (
                <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.05] px-4 text-sm font-medium backdrop-blur transition-colors hover:border-white/30">
                  {link.label} <ArrowUpRight className="size-3.5" />
                </a>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <div className="mx-auto grid max-w-4xl gap-16 px-5 py-16 sm:px-8 sm:py-20">
        {bio ? (
          <section>
            <h2 className="type-eyebrow mb-4 text-muted">{t("Über uns")}</h2>
            <p className="whitespace-pre-line text-[19px] leading-relaxed sm:text-[21px]">{bio}</p>
          </section>
        ) : null}

        {showPlayer ? (
          <section>
            <h2 className="type-eyebrow mb-4 text-muted">{t("Reinhören")}</h2>
            <SpotifyPlayer defaultUrl={player?.url ?? null} tracks={tracks} />
          </section>
        ) : null}

        <section>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="type-eyebrow text-muted">{t("Konzerte")}</h2>
            <a href={`/api/public/bands/${band.slug}/calendar`} className="inline-flex items-center gap-1.5 text-sm text-accent-text hover:underline">
              <CalendarPlus className="size-4" /> {t("Kalender abonnieren")}
            </a>
          </div>
          {gigs.length === 0 ? <p className="text-muted">{t("Gerade keine Konzerte geplant – schau bald wieder vorbei.")}</p> : (
            <ul className="divide-y divide-border overflow-hidden rounded-[18px] border border-border bg-surface">
              {gigs.map((gig) => (
                <li key={gig.id} className="flex items-center gap-4 px-4 py-4 sm:gap-6 sm:px-5">
                  <span className="flex w-14 shrink-0 flex-col items-center rounded-[12px] border border-accent/25 bg-accent-soft py-1.5 text-accent-text">
                    <span className="font-mono text-[9.5px] uppercase tracking-[0.08em]">{weekday.format(gig.startsAt).replace(".", "")}</span>
                    <span className="type-display text-[26px] leading-[1.05]">{day.format(gig.startsAt).replace(".", "")}</span>
                    <span className="font-mono text-[9.5px] uppercase tracking-[0.08em]">{month.format(gig.startsAt).replace(".", "")}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-semibold">{gig.title}</span>
                    {gig.venueLabel ? <span className="mt-0.5 flex items-center gap-1 text-sm text-muted"><MapPin className="size-3.5" /><span className="truncate">{gig.venueLabel}</span></span> : null}
                  </span>
                  <span className="type-meta hidden shrink-0 text-right text-muted sm:block">
                    {gig.doorsAt ? <>{t("Einlass")} {time.format(gig.doorsAt)}<br /></> : null}
                    {t("Beginn")} {time.format(gig.startsAt)} · {year.format(gig.startsAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {songs.length ? (
          <section>
            <h2 className="type-eyebrow mb-4 text-muted">{t("Musik")}</h2>
            <ul className="space-y-3">
              {songs.map((song) => (
                <li key={song.id} className="rounded-[18px] border border-border bg-surface p-4">
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-fg/[0.06]"><Music2 className="size-4" /></span>
                    <span className="min-w-0 flex-1 truncate font-medium">{song.title}</span>
                    <span className="type-meta text-muted">{formatDuration(song.durationSeconds)}</span>
                    {song.spotifyUrl ? (
                      <a href={song.spotifyUrl} target="_blank" rel="noopener noreferrer" aria-label={t("{title} auf Spotify", { title: song.title })} className="text-muted transition-colors hover:text-fg">
                        <SocialIcon kind="spotify" className="size-[18px]" />
                      </a>
                    ) : null}
                  </div>
                  {song.audioVersions[0] ? <audio controls preload="none" src={`/api/public/bands/${band.slug}/audio/${song.id}`} className="mt-3 w-full" /> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {band.contactEmail ? (
          <section className="theme-dark overflow-hidden rounded-[22px] bg-[#0b0e12] p-7 text-fg sm:p-9">
            <h2 className="type-eyebrow text-muted">{t("Booking & Presse")}</h2>
            <a href={`mailto:${band.contactEmail}`} className="type-display mt-3 inline-flex items-center gap-3 break-all text-[26px] transition-colors hover:text-accent-text sm:text-[34px]">
              <Mail className="size-6 shrink-0" /> {band.contactEmail}
            </a>
          </section>
        ) : null}
      </div>

      <footer className="border-t border-border py-8 text-center text-sm text-muted">
        <Link href="/" className="inline-flex items-center gap-2 hover:text-fg"><BrandMark className="size-5 rounded-[6px]" /> {t("Erstellt mit Bandival")}</Link>
        <LegalLinks className="mt-4 justify-center text-xs" />
      </footer>
    </main>
    </I18nProvider>
  );
}
