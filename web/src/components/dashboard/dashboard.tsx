"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { ArrowRight, ArrowUpRight, CalendarPlus, Check, ListMusic, ListPlus, MapPin, Plus, Radio } from "lucide-react";
import { describeActivity } from "@/lib/client/activity";
import { cn } from "@/lib/client/cn";
import { daysUntil, EVENT_KIND_LABEL, formatBpm, formatDayDistance, formatRelative, formatTimeRange, SONG_STATUS_LABEL } from "@/lib/client/format";
import { useSetlists, useSongs, useTasks, useUpcomingEvents } from "@/lib/client/hooks";
import { useRsvp } from "@/lib/client/mutations";
import type { AuditEntry, BandEvent } from "@/lib/client/types";
import { ButtonLink } from "@/components/ui/button";
import { Avatar, Badge, Card, CardHeader, EmptyState, Skeleton } from "@/components/ui/display";
import { useSession } from "@/components/providers/session";
import { AttendanceBar, AttendanceText, RsvpButtons } from "@/components/calendar/event-bits";
import { t } from "@/lib/i18n";
import { intlLocale } from "@/lib/i18n";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return t("Gute Nacht");
  if (hour < 11) return t("Guten Morgen");
  if (hour < 17) return "Hallo";
  return t("Guten Abend");
}

function todayLabel(): string {
  return new Date().toLocaleDateString(intlLocale(), { weekday: "long", day: "numeric", month: "long" });
}

function dateParts(value: string) {
  const date = new Date(value);
  return {
    weekday: date.toLocaleDateString(intlLocale(), { weekday: "short" }).replace(".", ""),
    day: date.getDate(),
    month: date.toLocaleDateString(intlLocale(), { month: "short" }).replace(".", ""),
  };
}

/** Counts up to the value once – a small, physical moment when the numbers arrive. */
function CountUp({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let frame = 0;
    const start = performance.now();
    const duration = 900;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 4);
      setDisplay(Math.round(value * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <>{display}</>;
}

export function Dashboard() {
  const { band } = useSession();
  return band?.role === "guest" ? <GuestHome /> : <MemberDashboard />;
}

function Greeting({ eyebrow, children }: { eyebrow: string; children?: React.ReactNode }) {
  const { me } = useSession();
  return (
    <div className="min-w-0">
      <p className="type-eyebrow text-muted" suppressHydrationWarning>{eyebrow}</p>
      <h1 className="type-display mt-3 text-[38px] sm:text-[56px]" suppressHydrationWarning>
        {greeting()}, <span className="text-muted">{me?.displayName.split(" ")[0]}.</span>
      </h1>
      {children}
    </div>
  );
}

/** Start page for guests (session musicians): just the setlists shared with them. */
function GuestHome() {
  const { band, bandId } = useSession();
  const setlists = useSetlists(bandId);
  const list = setlists.data?.setlists ?? [];
  return (
    <div className="space-y-8">
      <Greeting eyebrow={`${band?.name ?? ""} · Gastzugang`}>
        <p className="mt-3 max-w-xl text-[15px] text-muted">{t("Hier findest du die Setlists, Lead Sheets und Aufnahmen, die die Band mit dir teilt.")}</p>
      </Greeting>
      {setlists.isLoading ? <Skeleton className="h-40" /> : list.length === 0 ? (
        <EmptyState icon={<ListMusic />} title={t("Noch nichts geteilt")} description={t("Sobald die Band eine Setlist mit dir teilt, erscheint sie hier.")} />
      ) : (
        <div className="stagger grid gap-3 sm:grid-cols-2">
          {list.map((setlist) => (
            <Card key={setlist.id} className="card-hover flex flex-col gap-5">
              <div>
                <p className="type-eyebrow text-muted">{setlist.items.length} {t("Songs")}</p>
                <Link href={`/app/setlists/${setlist.id}`} className="type-display mt-2 block text-[26px] hover:text-muted">{setlist.name}</Link>
              </div>
              <div className="mt-auto flex gap-2">
                <ButtonLink href={`/app/setlists/${setlist.id}`} size="sm">{t("Öffnen")}</ButtonLink>
                <ButtonLink href={`/app/setlists/${setlist.id}/stage`} size="sm" variant="accent" icon={<Radio />}>{t("Live-Modus")}</ButtonLink>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The next event as a ticket: dark "stage" card in both themes, perforation above the stub with the RSVP.
 */
function NextUpTicket({ event }: { event: BandEvent }) {
  const rsvp = useRsvp();
  const days = daysUntil(event.startsAt);
  const today = days <= 0;
  const date = new Date(event.startsAt).toLocaleDateString(intlLocale(), { weekday: "short", day: "2-digit", month: "2-digit" });

  return (
    <section className="theme-dark ticket relative overflow-hidden rounded-[20px] bg-[#0d1014] text-fg [--notch-y:calc(100%-4rem)]">
      <div className="pointer-events-none absolute -top-40 left-[18%] h-80 w-[44rem] rounded-full bg-[radial-gradient(closest-side,rgb(255_255_255/0.075),transparent)]" aria-hidden />
      <div className="pointer-events-none absolute -bottom-24 right-[-6rem] h-64 w-96 rounded-full bg-[radial-gradient(closest-side,rgb(255_98_36/0.16),transparent)] [animation:drift_9s_ease-in-out_infinite]" aria-hidden />
      <div className="relative px-5 pb-6 pt-5 sm:px-8 sm:pb-8 sm:pt-7">
        <div className="type-eyebrow flex items-center gap-2.5 text-muted">
          {today ? <span className="led led-pulse" /> : <span className="size-1.5 rounded-full bg-fg/35" />}
          <span className={cn(today && "text-accent-text")}>{t("Als Nächstes ·")} {formatDayDistance(event.startsAt)}</span>
          <span className="ml-auto">{EVENT_KIND_LABEL[event.kind]}{event.status === "confirmed" ? t(" · bestätigt") : ""}</span>
        </div>
        <Link href={`/app/events/${event.id}`} className="type-display mt-5 block text-[36px] transition-colors hover:text-white/80 sm:text-[58px]">
          {event.title}
        </Link>
        <div className="type-meta mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] text-muted">
          <span className="text-fg">{date}</span>
          <span>{formatTimeRange(event.startsAt, event.endsAt)}</span>
          {event.venueLabel ? <span className="inline-flex min-w-0 items-center gap-1.5"><MapPin className="size-3.5" /><span className="truncate">{event.venueLabel}</span></span> : null}
          {event.setlist ? <Link href={`/app/setlists/${event.setlist.id}`} className="link-draw inline-flex items-center gap-1.5 hover:text-fg"><ListMusic className="size-3.5" />{event.setlist.name}</Link> : null}
        </div>
      </div>
      <div className="relative mx-5 border-t border-dashed border-white/15 sm:mx-8" aria-hidden />
      <div className="relative flex h-16 items-center justify-between gap-3 px-5 sm:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="hidden w-20 shrink-0 sm:block"><AttendanceBar summary={event.availability.summary} /></div>
          <span className="min-w-0 truncate"><AttendanceText summary={event.availability.summary} /></span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {event.setlist && event.kind === "gig" ? (
            <ButtonLink href={`/app/setlists/${event.setlist.id}/stage`} size="sm" variant="accent" icon={<Radio />} className="hidden sm:inline-flex">{t("Live")}</ButtonLink>
          ) : null}
          <RsvpButtons size="sm" value={event.availability.mine.status} onChange={(status) => void rsvp(event.id, status)} />
        </div>
      </div>
    </section>
  );
}

function StatStrip({ items, loading }: { items: Array<{ label: string; value: number; href: string }>; loading: boolean }) {
  return (
    <div className="card grid grid-cols-2 overflow-hidden sm:grid-cols-4">
      {items.map((stat, index) => (
        <Link
          key={stat.label}
          href={stat.href}
          className={cn(
            "group relative border-border p-4 transition-colors hover:bg-fg/[0.025] sm:p-5",
            index % 2 === 0 && "border-r",
            index >= 2 && "border-t sm:border-t-0",
            index === 1 && "sm:border-r",
          )}
        >
          <div className="type-eyebrow flex items-center justify-between text-muted">
            {stat.label}
            <ArrowUpRight className="size-3.5 -translate-x-1 translate-y-1 opacity-0 transition-[opacity,transform] duration-300 ease-out-expo group-hover:translate-x-0 group-hover:translate-y-0 group-hover:opacity-100" />
          </div>
          <div className="type-display mt-4 text-[40px] tabular-nums sm:text-[48px]">{loading ? "–" : <CountUp value={stat.value} />}</div>
        </Link>
      ))}
    </div>
  );
}

function EventRow({ event }: { event: BandEvent }) {
  const rsvp = useRsvp();
  const parts = dateParts(event.startsAt);
  const gig = event.kind === "gig";
  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-5 sm:px-5">
      <div className="flex min-w-0 flex-1 items-start gap-4">
        <Link
          href={`/app/events/${event.id}`}
          className={cn(
            "flex w-[52px] shrink-0 flex-col items-center rounded-[12px] border py-1.5 transition-colors",
            gig ? "border-accent/25 bg-accent-soft text-accent-text hover:border-accent/50" : "border-border hover:border-border-strong",
          )}
          aria-label={t(`${event.title} öffnen`)}
        >
          <span className={cn("font-mono text-[9.5px] uppercase tracking-[0.08em]", gig ? "" : "text-muted")}>{parts.weekday}</span>
          <span className="type-display text-[24px] leading-[1.05]">{parts.day}</span>
          <span className={cn("font-mono text-[9.5px] uppercase tracking-[0.08em]", gig ? "" : "text-muted")}>{parts.month}</span>
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link href={`/app/events/${event.id}`} className="truncate text-[15px] font-semibold tracking-[-0.01em] hover:underline">{event.title}</Link>
            {event.title.trim().toLowerCase() !== EVENT_KIND_LABEL[event.kind].toLowerCase() ? <Badge tone={gig ? "accent" : "neutral"}>{EVENT_KIND_LABEL[event.kind]}</Badge> : null}
            {event.status === "confirmed" ? <Badge tone="success">{t("Bestätigt")}</Badge> : null}
          </div>
          <div className="type-meta mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-muted">
            <span className="text-fg/80">{formatDayDistance(event.startsAt)}</span>
            <span>{formatTimeRange(event.startsAt, event.endsAt)}</span>
            {event.venueLabel ? <span className="inline-flex min-w-0 items-center gap-1"><MapPin className="size-3" /><span className="truncate">{event.venueLabel}</span></span> : null}
          </div>
          <div className="mt-2.5 flex items-center gap-3">
            <AttendanceBar summary={event.availability.summary} className="max-w-24" />
            <AttendanceText summary={event.availability.summary} />
          </div>
        </div>
      </div>
      <div className="pl-[68px] sm:pl-0">
        <RsvpButtons size="sm" value={event.availability.mine.status} onChange={(status) => void rsvp(event.id, status)} />
      </div>
    </li>
  );
}

function MemberDashboard() {
  const { band, bandId, can } = useSession();
  const events = useUpcomingEvents(bandId, 7);
  const songs = useSongs(bandId);
  const setlists = useSetlists(bandId);
  const tasks = useTasks(bandId, { status: "active" });
  const activity = useSWR<{ logs: AuditEntry[] }>(bandId ? `/api/bands/${bandId}/audit?limit=8` : null);

  const songList = songs.data?.songs ?? [];
  const inProgress = songList.filter((song) => song.workflowStatus === "draft" || song.workflowStatus === "review").slice(0, 5);
  const stageReady = songList.filter((song) => song.workflowStatus === "approved").length;
  const nextEvents = (events.data?.events ?? []).filter((event) => event.status !== "cancelled");
  const pendingRsvp = nextEvents.filter((event) => !event.availability.mine.status).length;
  const [next, ...later] = nextEvents;

  return (
    <div className="space-y-6 sm:space-y-8">
      <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <Greeting eyebrow={`${todayLabel()} · ${band?.name ?? ""}`}>
          {pendingRsvp > 0 ? (
            <p className="mt-3 text-[15px] text-muted">
              {pendingRsvp === 1 ? t("Bei 1 Termin fehlt noch deine Zusage.") : t("Bei {count} Terminen fehlt noch deine Zusage.", { count: pendingRsvp })}
            </p>
          ) : null}
        </Greeting>
        <div className="flex flex-wrap gap-2">
          {can("songs.create") ? <ButtonLink href="/app/songs?new=1" icon={<Plus />}>{t("Song")}</ButtonLink> : null}
          {can("setlists.create") ? <ButtonLink href="/app/setlists?new=1" icon={<ListPlus />}>{t("Setlist")}</ButtonLink> : null}
          {can("events.create") ? <ButtonLink href="/app/calendar?new=1" variant="primary" icon={<CalendarPlus />}>{t("Termin")}</ButtonLink> : null}
        </div>
      </header>

      {events.isLoading ? <Skeleton className="h-64 rounded-[20px]" /> : next ? <NextUpTicket event={next} /> : null}

      <StatStrip
        loading={songs.isLoading}
        items={[
          { label: t("Songs"), value: songList.length, href: "/app/songs" },
          { label: t("Bühnenreif"), value: stageReady, href: "/app/songs?status=approved" },
          { label: t("Setlists"), value: setlists.data?.setlists.length ?? 0, href: "/app/setlists" },
          { label: t("Termine"), value: nextEvents.length, href: "/app/calendar" },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" padded={false}>
          <div className="p-4 pb-1 sm:p-5 sm:pb-1">
            <CardHeader
              title={t("Danach")}
              description={t("Sag direkt zu – deine Band sieht sofort, wer da ist.")}
              action={<ButtonLink href="/app/calendar" size="sm" variant="ghost">{t("Kalender")} <ArrowRight /></ButtonLink>}
            />
          </div>
          {events.isLoading ? (
            <div className="space-y-3 p-5 pt-0"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
          ) : nextEvents.length === 0 ? (
            <div className="p-5 pt-0">
              <EmptyState
                icon={<CalendarPlus />}
                title={t("Keine anstehenden Termine")}
                description={t("Plane die nächste Probe – der Terminfinder zeigt dir, wann alle können.")}
                action={can("events.create") ? <ButtonLink href="/app/calendar?new=1" variant="primary" icon={<CalendarPlus />}>{t("Termin planen")}</ButtonLink> : null}
              />
            </div>
          ) : later.length === 0 ? (
            <p className="px-5 pb-6 text-sm text-muted">{t("Danach ist noch nichts geplant.")}</p>
          ) : (
            <ul className="stagger divide-y divide-border border-t border-border">
              {later.map((event) => <EventRow key={event.id} event={event} />)}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title={t("Offene Aufgaben")} action={tasks.data ? <span className="type-meta text-muted">{tasks.data.tasks.length}</span> : null} />
            {tasks.isLoading ? <Skeleton className="h-24" /> : (tasks.data?.tasks ?? []).length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-muted"><Check className="size-4 text-success" />{t("Alles erledigt.")}</p>
            ) : (
              <ul className="stagger -mx-2 space-y-0.5">
                {tasks.data?.tasks.slice(0, 6).map((task) => (
                  <li key={task.id}>
                    <Link
                      href={task.song ? `/app/songs/${task.song.id}?tab=tasks` : task.setlist ? `/app/setlists/${task.setlist.id}?tab=tasks` : "#"}
                      className="group flex items-start gap-3 rounded-[10px] px-2 py-2 transition-colors hover:bg-fg/[0.035]"
                    >
                      <span
                        className={cn(
                          "mt-[3px] flex size-[15px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors",
                          task.status === "in_progress" ? "border-accent" : "border-fg/25 group-hover:border-fg/50",
                        )}
                      >
                        {task.status === "in_progress" ? <span className="size-[7px] rounded-full bg-accent" /> : null}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm">{task.title}</span>
                        <span className="type-meta block truncate text-[11px] text-muted">{task.song?.title ?? task.setlist?.name}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title={t("Songs in Arbeit")} action={<ButtonLink href="/app/songs" size="sm" variant="ghost">{t("Alle")}</ButtonLink>} />
            {songs.isLoading ? <Skeleton className="h-24" /> : inProgress.length === 0 ? (
              <p className="text-sm text-muted">{t("Keine offenen Songs – alles bühnenreif.")}</p>
            ) : (
              <ul className="stagger -mx-2 space-y-0.5">
                {inProgress.map((song) => (
                  <li key={song.id}>
                    <Link href={`/app/songs/${song.id}`} className="flex items-center justify-between gap-3 rounded-[10px] px-2 py-2 transition-colors hover:bg-fg/[0.035]">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{song.title}</span>
                        <span className="type-meta block truncate text-[11px] text-muted">
                          {[song.keySignature, formatBpm(song.tempoBpm)].filter(Boolean).join(" · ") || "–"}
                        </span>
                      </span>
                      <Badge tone={song.workflowStatus === "review" ? "warning" : "neutral"}>{SONG_STATUS_LABEL[song.workflowStatus]}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader title={t("Letzte Aktivität")} action={<ButtonLink href="/app/activity" size="sm" variant="ghost">{t("Alle")} <ArrowRight /></ButtonLink>} />
        {activity.isLoading ? <Skeleton className="h-24" /> : (activity.data?.logs ?? []).length === 0 ? (
          <p className="text-sm text-muted">{t("Noch keine Aktivität.")}</p>
        ) : (
          <ul className="stagger relative space-y-1 before:absolute before:bottom-3 before:left-[11px] before:top-3 before:w-px before:bg-border">
            {activity.data?.logs.map((entry) => {
              const described = describeActivity(entry);
              const content = (
                <>
                  <Avatar name={entry.actor?.displayName ?? t("System")} src={entry.actor?.avatarUrl} size="xs" className="relative ring-4 ring-surface" />
                  <span className="min-w-0 flex-1 text-sm leading-6">
                    <span className="font-medium">{entry.actor?.displayName ?? t("System")}</span>{" "}
                    <span className="text-muted">{described.text}</span>
                  </span>
                  <span className="type-meta shrink-0 pt-0.5 text-[11px] text-subtle">{formatRelative(entry.createdAt)}</span>
                </>
              );
              return (
                <li key={entry.id}>
                  {described.href ? (
                    <Link href={described.href} className="flex items-start gap-3 rounded-[10px] py-1.5 pr-2 transition-colors hover:bg-fg/[0.03]">{content}</Link>
                  ) : (
                    <div className="flex items-start gap-3 py-1.5">{content}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
