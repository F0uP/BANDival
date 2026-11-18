"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CalendarCheck2, CalendarPlus, CalendarRange, ChevronLeft, ChevronRight, ListMusic, MapPin, MoreHorizontal, Pencil, RefreshCw, Sparkles, Trash2, X,
} from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import { cn } from "@/lib/client/cn";
import {
  addDays, AVAILABILITY_LABEL, EVENT_KIND_LABEL, EVENT_STATUS_LABEL, formatDateLong, formatMonth, formatRelative, formatTime, formatTimeRange,
  fromDateKey, rangeKeys, toDateKey, WEEKDAYS_SHORT,
} from "@/lib/client/format";
import { useCalendarOverview } from "@/lib/client/hooks";
import { useRevalidate, useRsvp } from "@/lib/client/mutations";
import type { AvailabilityStatus, BandEvent, CalendarOverview } from "@/lib/client/types";
import { Button } from "@/components/ui/button";
import { Avatar, Badge, Card, EmptyState, PageHeader } from "@/components/ui/display";
import { Menu } from "@/components/ui/navigation";
import { useConfirm, useToast } from "@/components/ui/feedback";
import { useSession } from "@/components/providers/session";
import { AttendanceBar, AttendanceText, EventKindIcon, KIND_STYLE, RsvpButtons, SourceHint, STATUS_DOT } from "@/components/calendar/event-bits";
import { DateFinderDialog } from "@/components/calendar/date-finder";
import { EventDialog, type EventDraft } from "@/components/calendar/event-dialog";
import { CalendarSyncDialog } from "@/components/calendar/sync-dialog";

const MY_DAY_STYLE: Record<AvailabilityStatus, string> = {
  available: "bg-success-soft",
  maybe: "bg-warning-soft",
  unavailable: "bg-danger-soft",
};

function monthGrid(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const start = toDateKey(new Date(first.getFullYear(), first.getMonth(), 1 - offset));
  const keys = Array.from({ length: 42 }, (_, index) => addDays(start, index));
  return { keys, from: keys[0], to: keys[41] };
}

function eventsByDay(events: BandEvent[]) {
  const map = new Map<string, BandEvent[]>();
  for (const event of events) {
    const key = toDateKey(new Date(event.startsAt));
    map.set(key, [...(map.get(key) ?? []), event]);
  }
  return map;
}

function EventCard({ event, overview, onEdit }: { event: BandEvent; overview: CalendarOverview; onEdit: (event: BandEvent) => void }) {
  const { can } = useSession();
  const router = useRouter();
  const rsvp = useRsvp();
  const confirm = useConfirm();
  const toast = useToast();
  const revalidate = useRevalidate();
  const [showMembers, setShowMembers] = useState(false);
  const cancelled = event.status === "cancelled";
  const memberById = new Map(overview.members.map((member) => [member.userId, member]));

  const remove = async () => {
    const ok = await confirm({ title: `„${event.title}“ löschen?`, confirmLabel: "Löschen", tone: "danger" });
    if (!ok) return;
    let scope = "single";
    if (event.recurrenceGroupId) {
      const all = await confirm({ title: "Serientermin", description: "Auch alle folgenden Termine dieser Serie löschen?", confirmLabel: "Ja, alle folgenden", cancelLabel: "Nur diesen" });
      scope = all ? "following" : "single";
    }
    try {
      await api.delete(`/api/events/${event.id}?scope=${scope}`);
      await revalidate("/api/calendar/overview", "/api/events");
      toast.success("Termin gelöscht.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <div className={cn("rounded-2xl border border-border bg-surface p-3.5", cancelled && "opacity-60")}>
      <div className="flex items-start gap-3">
        <EventKindIcon kind={event.kind} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Link href={`/app/events/${event.id}`} className={cn("font-medium hover:underline", cancelled && "line-through")}>{event.title}</Link>
            {event.status !== "planned" ? <Badge tone={cancelled ? "danger" : "success"}>{EVENT_STATUS_LABEL[event.status]}</Badge> : null}
          </div>
          <div className="mt-0.5 text-[13px] text-muted">{EVENT_KIND_LABEL[event.kind]} · {formatTimeRange(event.startsAt, event.endsAt)}</div>
          {event.venueLabel ? (
            <a
              href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(event.venueLabel)}`}
              target="_blank"
              rel="noreferrer"
              className="mt-1 flex items-center gap-1 text-[13px] text-muted hover:text-fg"
            >
              <MapPin className="size-3.5 shrink-0" /><span className="truncate">{event.venueLabel}</span>
            </a>
          ) : null}
          {event.setlist ? (
            <Link href={`/app/setlists/${event.setlist.id}`} className="mt-1 flex items-center gap-1 text-[13px] text-accent-text hover:underline">
              <ListMusic className="size-3.5" />{event.setlist.name}
            </Link>
          ) : null}
        </div>
        {can("events.manage") ? (
          <Menu
            trigger={({ toggle }) => <Button size="icon-sm" variant="ghost" onClick={toggle} aria-label="Aktionen"><MoreHorizontal /></Button>}
            items={[
              { label: "Bearbeiten", icon: <Pencil />, onSelect: () => onEdit(event) },
              { label: event.kind === "gig" ? "Gig-Details & Rider" : "Protokoll & Probenplan", icon: <ListMusic />, onSelect: () => router.push(`/app/events/${event.id}`) },
              { type: "separator" },
              { label: "Löschen", icon: <Trash2 />, danger: true, onSelect: () => void remove() },
            ]}
          />
        ) : null}
      </div>
      {event.notes ? <p className="mt-2.5 whitespace-pre-wrap rounded-lg bg-surface-2 px-3 py-2 text-[13px] text-muted">{event.notes}</p> : null}
      {!cancelled ? (
        <>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <RsvpButtons size="sm" value={event.availability.mine.status} onChange={(status) => void rsvp(event.id, status)} />
            {event.availability.mine.source !== "event" ? <SourceHint source={event.availability.mine.source} /> : null}
          </div>
          <button type="button" onClick={() => setShowMembers((value) => !value)} className="mt-3 block w-full text-left">
            <AttendanceBar summary={event.availability.summary} />
            <div className="mt-1.5 flex items-center justify-between">
              <AttendanceText summary={event.availability.summary} />
              <span className="text-xs text-accent-text">{showMembers ? "weniger" : "wer?"}</span>
            </div>
          </button>
          {showMembers ? (
            <ul className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {event.availability.members.map((entry) => {
                const member = memberById.get(entry.userId);
                return (
                  <li key={entry.userId} className="flex items-center gap-2 text-[13px]">
                    <span className="relative">
                      <Avatar name={member?.displayName} src={member?.avatarUrl} size="xs" />
                      <span className={cn("absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-surface", entry.status ? STATUS_DOT[entry.status] : "bg-surface-3")} />
                    </span>
                    <span className="truncate">{member?.displayName}</span>
                    <span className="ml-auto shrink-0 text-xs text-muted">
                      {entry.status ? AVAILABILITY_LABEL[entry.status] : "offen"}{entry.source === "calendar" ? " · Kalender" : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function DayPanel({
  dateKey,
  overview,
  events,
  onCreate,
  onEdit,
  onSetDay,
}: {
  dateKey: string;
  overview: CalendarOverview;
  events: BandEvent[];
  onCreate: (draft: EventDraft) => void;
  onEdit: (event: BandEvent) => void;
  onSetDay: (dates: string[], status: AvailabilityStatus | null) => void;
}) {
  const { can, me } = useSession();
  const day = overview.days[dateKey];
  const busy = overview.myBusy[dateKey] ?? [];
  const mine = day?.mine;
  const others = overview.members.filter((member) => member.userId !== me?.userId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">{formatDateLong(fromDateKey(dateKey))}</h2>
        {can("events.create") ? (
          <Button size="sm" icon={<CalendarPlus />} onClick={() => onCreate({ date: dateKey })}>Termin</Button>
        ) : null}
      </div>

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Deine Verfügbarkeit</span>
          {mine?.source === "calendar" ? <SourceHint source="calendar" /> : null}
        </div>
        <RsvpButtons value={mine?.source === "day" ? mine.status : null} onChange={(status) => onSetDay([dateKey], status)} />
        {busy.length > 0 ? (
          <ul className="space-y-1 border-t border-border pt-3">
            {busy.map((block, index) => (
              <li key={index} className="flex items-center gap-2 text-[13px] text-muted">
                <CalendarCheck2 className="size-3.5 shrink-0" />
                <span className="shrink-0 tabular-nums">{block.allDay ? "Ganztägig" : formatTimeRange(block.start, block.end)}</span>
                <span className="truncate">{block.title ?? "Belegt"}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      {events.length > 0 ? (
        <div className="space-y-3">
          {events.map((event) => <EventCard key={event.id} event={event} overview={overview} onEdit={onEdit} />)}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">Keine Termine an diesem Tag.</p>
      )}

      {others.length > 0 && day ? (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium">Wer kann?</span>
            <AttendanceText summary={day.summary} />
          </div>
          <ul className="space-y-2">
            {others.map((member) => {
              const entry = day.members[member.userId];
              return (
                <li key={member.userId} className="flex items-center gap-2.5 text-sm">
                  <span className="relative">
                    <Avatar name={member.displayName} src={member.avatarUrl} size="sm" />
                    <span className={cn("absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-surface", entry?.status ? STATUS_DOT[entry.status] : entry?.partial ? "bg-warning" : "bg-surface-3")} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{member.displayName}</span>
                    {member.instrument ? <span className="block truncate text-xs text-muted">{member.instrument}</span> : null}
                  </span>
                  <span className="shrink-0 text-xs text-muted">
                    {entry?.status ? AVAILABILITY_LABEL[entry.status] : entry?.partial ? "teilweise belegt" : "keine Angabe"}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

export function CalendarView() {
  const router = useRouter();
  const params = useSearchParams();
  const { bandId, can } = useSession();
  const toast = useToast();
  const revalidate = useRevalidate();
  const today = toDateKey(new Date());

  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selected, setSelected] = useState(today);
  const [multi, setMulti] = useState<string[] | null>(null);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [eventDialog, setEventDialog] = useState<{ event: BandEvent | null; draft: EventDraft | null } | null>(
    () => (params.get("new") === "1" ? { event: null, draft: null } : null),
  );
  const [syncOpen, setSyncOpen] = useState(params.get("sync") === "1");
  const [finderOpen, setFinderOpen] = useState(false);

  const grid = useMemo(() => monthGrid(month), [month]);
  const { data: overview, isLoading } = useCalendarOverview(bandId, grid.from, grid.to);
  const byDay = useMemo(() => eventsByDay(overview?.events ?? []), [overview?.events]);
  const monthKey = toDateKey(month).slice(0, 7);
  const monthEvents = (overview?.events ?? []).filter((event) => toDateKey(new Date(event.startsAt)).startsWith(monthKey));

  const shiftMonth = (delta: number) => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));

  const setDays = async (dates: string[], status: AvailabilityStatus | null) => {
    try {
      await api.put("/api/calendar/availability", { dates, status, bandId });
      await revalidate("/api/calendar/overview", "/api/events", "/api/calendar/suggestions");
      if (dates.length > 1) toast.success(`${dates.length} Tage aktualisiert.`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const onDayClick = (key: string, shift: boolean) => {
    if (multi) {
      if (shift && anchor) {
        setMulti(Array.from(new Set([...multi, ...rangeKeys(anchor, key)])));
      } else {
        setMulti(multi.includes(key) ? multi.filter((entry) => entry !== key) : [...multi, key]);
      }
      setAnchor(key);
      return;
    }
    setSelected(key);
    if (key.slice(0, 7) !== monthKey) {
      const date = fromDateKey(key);
      setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    }
  };

  const closeEventDialog = () => {
    setEventDialog(null);
    if (params.get("new")) router.replace("/app/calendar");
  };

  const showSyncHint = overview && overview.sync.sources === 0;

  return (
    <>
      <PageHeader
        title="Kalender"
        description="Proben, Gigs und wer wann kann."
        actions={(
          <>
            <Button icon={<Sparkles />} onClick={() => setFinderOpen(true)}>Terminfinder</Button>
            <Button icon={<RefreshCw />} onClick={() => setSyncOpen(true)}>
              Kalender-Sync
              {overview?.sync.hasErrors ? <span className="size-2 rounded-full bg-danger" /> : null}
            </Button>
            {can("events.create") ? (
              <Button variant="primary" icon={<CalendarPlus />} onClick={() => setEventDialog({ event: null, draft: { date: selected } })}>Termin</Button>
            ) : null}
          </>
        )}
      />

      {showSyncHint ? (
        <button
          type="button"
          onClick={() => setSyncOpen(true)}
          className="mb-5 flex w-full items-center gap-3 rounded-2xl border border-accent/30 bg-accent-soft px-4 py-3 text-left transition-colors hover:border-accent/60"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-fg"><CalendarCheck2 className="size-4" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Google-, iCloud- oder Outlook-Kalender verbinden</span>
            <span className="block text-[13px] text-muted">Deine Termine blocken automatisch – nie wieder Verfügbarkeit von Hand eintragen.</span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted" />
        </button>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div>
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <Button size="icon-sm" variant="ghost" onClick={() => shiftMonth(-1)} aria-label="Vorheriger Monat"><ChevronLeft /></Button>
              <h2 className="min-w-40 text-center text-base font-semibold capitalize">{formatMonth(month)}</h2>
              <Button size="icon-sm" variant="ghost" onClick={() => shiftMonth(1)} aria-label="Nächster Monat"><ChevronRight /></Button>
            </div>
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => {
                const now = new Date();
                setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
                setSelected(today);
              }}>Heute</Button>
              <Button
                size="sm"
                variant={multi ? "primary" : "secondary"}
                icon={<CalendarRange />}
                onClick={() => {
                  setMulti(multi ? null : [selected]);
                  setAnchor(selected);
                }}
              >
                <span className="hidden sm:inline">Mehrere Tage</span>
              </Button>
            </div>
          </div>

          <div className={cn("card overflow-hidden transition-opacity", isLoading && !overview && "opacity-60")}>
            <div className="grid grid-cols-7 border-b border-border bg-surface-2/50">
              {WEEKDAYS_SHORT.map((label) => <div key={label} className="py-2 text-center text-xs font-medium text-muted">{label}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {grid.keys.map((key, index) => {
                const date = fromDateKey(key);
                const inMonth = key.startsWith(monthKey);
                const day = overview?.days[key];
                const mine = day?.mine;
                const events = byDay.get(key) ?? [];
                const isSelected = multi ? multi.includes(key) : key === selected;
                const others = Math.max(0, (day?.summary.total ?? 0) - 1);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={(event) => onDayClick(key, event.shiftKey)}
                    className={cn(
                      "relative flex min-h-16 flex-col items-stretch border-border p-1 text-left transition-colors sm:min-h-24 sm:p-1.5",
                      index % 7 !== 6 && "border-r",
                      index < 35 && "border-b",
                      !inMonth && "bg-surface-2/40",
                      mine?.status && mine.source !== null ? MY_DAY_STYLE[mine.status] : "",
                      isSelected ? "ring-2 ring-inset ring-accent" : "hover:bg-surface-2",
                    )}
                    aria-pressed={isSelected}
                    aria-label={formatDateLong(date)}
                  >
                    <span className="flex items-center justify-between">
                      <span className={cn(
                        "flex size-6 items-center justify-center rounded-full text-xs font-medium sm:text-[13px]",
                        key === today ? "bg-accent text-accent-fg" : inMonth ? "text-fg" : "text-subtle",
                      )}>
                        {date.getDate()}
                      </span>
                      {mine?.partial ? <span className="mr-0.5 size-1.5 rounded-full bg-warning" title="Teilweise belegt (Kalender)" /> : null}
                    </span>
                    <span className="mt-0.5 hidden flex-col gap-0.5 sm:flex">
                      {events.slice(0, 2).map((event) => (
                        <span key={event.id} className={cn("truncate rounded px-1 py-px text-[11px] font-medium", KIND_STYLE[event.kind], event.status === "cancelled" && "line-through opacity-60")}>
                          {formatTime(event.startsAt)} {event.title}
                        </span>
                      ))}
                      {events.length > 2 ? <span className="px-1 text-[11px] text-muted">+{events.length - 2}</span> : null}
                    </span>
                    <span className="mt-auto flex gap-0.5 pt-1 sm:hidden">
                      {events.slice(0, 3).map((event) => <span key={event.id} className={cn("size-1.5 rounded-full", event.kind === "gig" ? "bg-accent" : "bg-fg/60")} />)}
                    </span>
                    {others > 0 && day && (day.summary.available + day.summary.unavailable + day.summary.maybe) > 0 ? (
                      <span className="mt-1 hidden sm:block"><AttendanceBar summary={day.summary} className="h-1" /></span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-success-soft ring-1 ring-success/40" />Ich kann</span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-warning-soft ring-1 ring-warning/40" />Vielleicht</span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-danger-soft ring-1 ring-danger/40" />Kann nicht / belegt</span>
            <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-warning" />teilweise belegt</span>
            {overview?.sync.lastSyncedAt ? <span className="ml-auto">Kalender-Sync {formatRelative(overview.sync.lastSyncedAt)}</span> : null}
          </div>

          {monthEvents.length > 0 ? (
            <div className="mt-8">
              <h3 className="mb-3 text-sm font-semibold">Termine im {formatMonth(month).split(" ")[0]}</h3>
              <ul className="card divide-y divide-border overflow-hidden">
                {monthEvents.map((event) => (
                  <li key={event.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(toDateKey(new Date(event.startsAt)))}
                      className={cn("flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2/60", event.status === "cancelled" && "opacity-60")}
                    >
                      <span className="w-11 shrink-0 text-center">
                        <span className="block text-lg font-semibold leading-none">{new Date(event.startsAt).getDate()}</span>
                        <span className="block text-[11px] uppercase text-muted">{WEEKDAYS_SHORT[(new Date(event.startsAt).getDay() + 6) % 7]}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("block truncate text-sm font-medium", event.status === "cancelled" && "line-through")}>{event.title}</span>
                        <span className="block truncate text-xs text-muted">{EVENT_KIND_LABEL[event.kind]} · {formatTimeRange(event.startsAt, event.endsAt)}{event.venueLabel ? ` · ${event.venueLabel}` : ""}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {event.availability.mine.status
                          ? <span className={cn("size-2.5 rounded-full", STATUS_DOT[event.availability.mine.status])} title="Deine Antwort" />
                          : <Badge tone="warning">offen</Badge>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          {overview ? (
            <DayPanel
              dateKey={selected}
              overview={overview}
              events={byDay.get(selected) ?? []}
              onCreate={(draft) => setEventDialog({ event: null, draft })}
              onEdit={(event) => setEventDialog({ event, draft: null })}
              onSetDay={(dates, status) => void setDays(dates, status)}
            />
          ) : (
            <EmptyState title="Kalender wird geladen …" />
          )}
        </aside>
      </div>

      {multi ? (
        <div className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-xl rounded-2xl border border-border bg-surface p-3 shadow-float lg:bottom-6">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">{multi.length} {multi.length === 1 ? "Tag" : "Tage"} ausgewählt</span>
            <button type="button" onClick={() => setMulti(null)} className="text-muted hover:text-fg" aria-label="Auswahl beenden"><X className="size-4" /></button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <RsvpButtons
              value={null}
              disabled={multi.length === 0}
              onChange={(status) => {
                void setDays(multi, status);
                setMulti(null);
              }}
            />
            <Button size="sm" variant="ghost" disabled={multi.length === 0} onClick={() => { void setDays(multi, null); setMulti(null); }}>Zurücksetzen</Button>
          </div>
          <p className="mt-2 text-xs text-muted">Tipp: Am Desktop mit Shift + Klick einen Zeitraum (z. B. Urlaub) auswählen.</p>
        </div>
      ) : null}

      <EventDialog open={Boolean(eventDialog)} onClose={closeEventDialog} event={eventDialog?.event ?? null} draft={eventDialog?.draft ?? null} />
      <CalendarSyncDialog open={syncOpen} onClose={() => setSyncOpen(false)} />
      <DateFinderDialog
        open={finderOpen}
        onClose={() => setFinderOpen(false)}
        onPick={(draft) => {
          setFinderOpen(false);
          setSelected(draft.date ?? selected);
          setEventDialog({ event: null, draft });
        }}
      />
    </>
  );
}
