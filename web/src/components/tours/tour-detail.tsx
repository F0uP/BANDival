"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import useSWR from "swr";
import {
  ArrowLeft, BedDouble, CalendarCheck, Car, FileDown, MoreHorizontal, Pencil, Plus, StickyNote, Trash2, Utensils, Mic2, MapPin,
} from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import { cn } from "@/lib/client/cn";
import { intlLocale, t, translatable } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, PageHeader, Skeleton } from "@/components/ui/display";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Menu, Segmented } from "@/components/ui/navigation";
import { useConfirm, useToast } from "@/components/ui/feedback";
import { useSession } from "@/components/providers/session";
import { formatDayRange, money, TourDialog } from "@/components/tours/tours-view";

type ItemKind = "travel" | "accommodation" | "meal" | "appointment" | "note";

type TourItem = {
  id: string;
  kind: ItemKind;
  title: string;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  toLocation: string | null;
  details: string | null;
  bookingRef: string | null;
  costCents: number | null;
  distanceKm: number | null;
};

type TourEvent = {
  id: string;
  title: string;
  kind: string;
  status: string;
  startsAt: string;
  endsAt: string | null;
  venueLabel: string | null;
  loadInAt: string | null;
  soundcheckAt: string | null;
  doorsAt: string | null;
  contactName: string | null;
  contactPhone: string | null;
  feeCents: number | null;
  setlist: { id: string; name: string } | null;
};

type TourData = {
  tour: { id: string; bandId: string; name: string; startsOn: string; endsOn: string; notes: string | null; timezone: string };
  events: TourEvent[];
  items: TourItem[];
  candidates: Array<{ id: string; title: string; kind: string; startsAt: string; venueLabel: string | null; tourId: string | null }>;
  totals: { gigs: number; days: number; distanceKm: number; costCents: number; feeCents: number };
};

const KIND_LABEL: Record<ItemKind, string> = translatable({ travel: "Fahrt", accommodation: "Unterkunft", meal: "Essen", appointment: "Termin", note: "Notiz" });
const KIND_ICON: Record<ItemKind, ReactNode> = {
  travel: <Car />, accommodation: <BedDouble />, meal: <Utensils />, appointment: <CalendarCheck />, note: <StickyNote />,
};
const KIND_TONE: Record<ItemKind | "gig", string> = {
  gig: "bg-accent text-accent-fg",
  travel: "bg-info/15 text-info",
  accommodation: "bg-[#7c5cd6]/15 text-[#7c5cd6]",
  meal: "bg-success/15 text-success",
  appointment: "bg-warning/15 text-warning",
  note: "bg-fg/[0.07] text-muted",
};

function dayKeyIn(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function timeIn(value: string, timeZone: string): string {
  return new Date(value).toLocaleTimeString(intlLocale(), { timeZone, hour: "2-digit", minute: "2-digit" });
}

function eachDay(from: string, to: string): string[] {
  const days: string[] = [];
  for (let date = new Date(`${from}T12:00:00Z`); days.length < 200; date = new Date(date.getTime() + 86_400_000)) {
    const key = date.toISOString().slice(0, 10);
    days.push(key);
    if (key >= to) break;
  }
  return days;
}

function toLocalInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

type Row =
  | { type: "event"; at: string; event: TourEvent }
  | { type: "item"; at: string; item: TourItem; checkout?: boolean };

export function TourDetail({ tourId }: { tourId: string }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const { can } = useSession();
  const { data, error, mutate } = useSWR<TourData>(`/api/tours/${tourId}`);
  const [itemDialog, setItemDialog] = useState<{ item: TourItem | null; day: string } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const manage = can("events.manage");

  const days = useMemo(() => {
    if (!data) return [];
    const zone = data.tour.timezone;
    const byDay = new Map<string, Row[]>();
    const add = (day: string, row: Row) => byDay.set(day, [...(byDay.get(day) ?? []), row]);
    for (const event of data.events) add(dayKeyIn(event.startsAt, zone), { type: "event", at: event.loadInAt ?? event.startsAt, event });
    for (const item of data.items) {
      add(dayKeyIn(item.startsAt, zone), { type: "item", at: item.startsAt, item });
      if (item.kind === "accommodation" && item.endsAt && dayKeyIn(item.endsAt, zone) !== dayKeyIn(item.startsAt, zone)) {
        add(dayKeyIn(item.endsAt, zone), { type: "item", at: item.endsAt, item, checkout: true });
      }
    }
    const keys = new Set([...eachDay(data.tour.startsOn, data.tour.endsOn), ...byDay.keys()]);
    return [...keys].sort().map((day) => ({ day, rows: (byDay.get(day) ?? []).sort((a, b) => a.at.localeCompare(b.at)) }));
  }, [data]);

  if (error) return <EmptyState title={t("Tour nicht gefunden")} action={<Link href="/app/tours" className="text-accent-text hover:underline">{t("Zu den Touren")}</Link>} />;
  if (!data) return <div className="space-y-4"><Skeleton className="h-16 w-2/3" /><Skeleton className="h-28" /><Skeleton className="h-64" /></div>;

  const { tour, totals } = data;
  const zone = tour.timezone;

  const removeTour = async () => {
    const ok = await confirm({ title: t("„{name}“ löschen?", { name: tour.name }), description: t("Fahrten, Unterkünfte und Notizen der Tour werden gelöscht – die Gigs bleiben im Kalender."), confirmLabel: t("Löschen"), tone: "danger" });
    if (!ok) return;
    try {
      await api.delete(`/api/tours/${tour.id}`);
      router.push("/app/tours");
    } catch (deleteError) {
      toast.error(errorMessage(deleteError));
    }
  };

  const removeItem = async (item: TourItem) => {
    const ok = await confirm({ title: t("„{name}“ löschen?", { name: item.title }), confirmLabel: t("Löschen"), tone: "danger" });
    if (!ok) return;
    await api.delete(`/api/tours/${tour.id}/items/${item.id}`).catch((deleteError) => toast.error(errorMessage(deleteError)));
    await mutate();
  };

  const dayLabel = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString(intlLocale(), { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });

  return (
    <>
      <Link href="/app/tours" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"><ArrowLeft className="size-4" /> {t("Touren")}</Link>
      <PageHeader
        title={tour.name}
        description={<>{formatDayRange(tour.startsOn, tour.endsOn)}{tour.notes ? <span className="mt-1 block whitespace-pre-wrap text-sm">{tour.notes}</span> : null}</>}
        actions={(
          <>
            <Button icon={<FileDown />} onClick={() => window.open(`/api/tours/${tour.id}/pdf`, "_blank")}>{t("Tourplan (PDF)")}</Button>
            {manage ? (
              <Menu
                trigger={({ toggle }) => <Button variant="ghost" size="icon" onClick={toggle} aria-label={t("Weitere Aktionen")}><MoreHorizontal /></Button>}
                items={[
                  { label: t("Bearbeiten"), icon: <Pencil />, onSelect: () => setEditOpen(true) },
                  { label: t("Gigs zuordnen"), icon: <Mic2 />, onSelect: () => setAssignOpen(true) },
                  { type: "separator" as const },
                  { label: t("Tour löschen"), icon: <Trash2 />, danger: true, onSelect: () => void removeTour() },
                ]}
              />
            ) : null}
          </>
        )}
      />

      <dl className="mb-8 grid grid-cols-2 overflow-hidden rounded-[20px] border border-border bg-surface sm:grid-cols-5">
        {([
          [t("Gigs"), String(totals.gigs)],
          [t("Tage"), String(totals.days)],
          [t("Strecke"), totals.distanceKm ? `${totals.distanceKm} km` : "–"],
          [t("Kosten"), totals.costCents ? money(totals.costCents) : "–"],
          [t("Gagen"), totals.feeCents ? money(totals.feeCents) : "–"],
        ] as Array<[string, string]>).map(([label, value], index) => (
          <div key={label} className={cn("border-border px-5 py-4", index > 0 && "border-l", index === 2 && "max-sm:border-l-0 max-sm:border-t", index > 2 && "max-sm:border-t")}>
            <dt className="type-eyebrow text-muted">{label}</dt>
            <dd className="type-display mt-1 text-[28px] tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <ol className="stagger space-y-6">
        {days.map(({ day, rows }) => {
          const outside = day < tour.startsOn || day > tour.endsOn;
          return (
            <li key={day} className="grid gap-3 md:grid-cols-[11rem_minmax(0,1fr)]">
              <div className="md:pt-3">
                <p className="text-[15px] font-semibold">{dayLabel(day)}</p>
                {outside ? <p className="type-meta text-[11px] text-subtle">{t("außerhalb des Zeitraums")}</p> : null}
                {manage ? (
                  <button type="button" onClick={() => setItemDialog({ item: null, day })} className="mt-1 inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
                    <Plus className="size-3.5" /> {t("Eintrag")}
                  </button>
                ) : null}
              </div>
              {rows.length === 0 ? (
                <div className="rounded-[18px] border border-dashed border-border px-4 py-4 text-sm text-subtle">{t("Freier Tag")}</div>
              ) : (
                <ul className="divide-y divide-border overflow-hidden rounded-[18px] border border-border bg-surface">
                  {rows.map((row) => row.type === "event" ? (
                    <li key={`event-${row.event.id}`} className={cn("flex gap-3 px-4 py-3.5", row.event.status === "cancelled" && "opacity-50")}>
                      <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full [&_svg]:size-4", KIND_TONE.gig)}><Mic2 /></span>
                      <div className="min-w-0 flex-1">
                        <Link href={`/app/events/${row.event.id}`} className="font-medium hover:underline">{row.event.title}</Link>
                        {row.event.status === "cancelled" ? <Badge tone="danger" className="ml-2">{t("Abgesagt")}</Badge> : null}
                        {row.event.venueLabel ? <p className="flex items-center gap-1 text-sm text-muted"><MapPin className="size-3.5" />{row.event.venueLabel}</p> : null}
                        <p className="type-meta mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted">
                          {([[t("Load-in"), row.event.loadInAt], [t("Soundcheck"), row.event.soundcheckAt], [t("Einlass"), row.event.doorsAt], [t("Beginn"), row.event.startsAt]] as Array<[string, string | null]>)
                            .filter(([, value]) => value)
                            .map(([label, value]) => <span key={label}>{label} <span className="text-fg">{timeIn(value!, zone)}</span></span>)}
                          {row.event.setlist ? <Link href={`/app/setlists/${row.event.setlist.id}`} className="text-accent-text hover:underline">{row.event.setlist.name}</Link> : null}
                        </p>
                      </div>
                      {row.event.feeCents ? <span className="shrink-0 text-sm tabular-nums text-muted">{money(row.event.feeCents)}</span> : null}
                    </li>
                  ) : (
                    <li key={`item-${row.item.id}-${row.checkout ? "out" : "in"}`} className="group flex gap-3 px-4 py-3.5">
                      <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full [&_svg]:size-4", KIND_TONE[row.item.kind])}>{KIND_ICON[row.item.kind]}</span>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-baseline gap-x-2">
                          <span className="type-meta text-[12px] tabular-nums text-muted">{timeIn(row.at, zone)}</span>
                          <span className="font-medium">
                            {row.checkout ? t("Check-out: {title}", { title: row.item.title }) : row.item.kind === "accommodation" ? t("Check-in: {title}", { title: row.item.title }) : row.item.title}
                          </span>
                        </p>
                        {!row.checkout ? (
                          <div className="mt-0.5 space-y-0.5 text-sm text-muted">
                            {row.item.kind === "travel" && (row.item.location || row.item.toLocation) ? (
                              <p>{[row.item.location, row.item.toLocation].filter(Boolean).join(" → ")}{row.item.distanceKm ? ` · ${row.item.distanceKm} km` : ""}{row.item.endsAt ? ` · ${t("Ankunft ca. {time}", { time: timeIn(row.item.endsAt, zone) })}` : ""}</p>
                            ) : row.item.location ? <p className="flex items-center gap-1"><MapPin className="size-3.5" />{row.item.location}</p> : null}
                            {row.item.bookingRef || row.item.costCents ? (
                              <p className="type-meta text-[11px]">{[row.item.bookingRef ? t("Buchung: {ref}", { ref: row.item.bookingRef }) : "", row.item.costCents ? money(row.item.costCents) : ""].filter(Boolean).join(" · ")}</p>
                            ) : null}
                            {row.item.details ? <p className="whitespace-pre-wrap">{row.item.details}</p> : null}
                          </div>
                        ) : null}
                      </div>
                      {manage && !row.checkout ? (
                        <div className="flex shrink-0 items-start gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
                          <Button size="icon-sm" variant="ghost" aria-label={t("Bearbeiten")} onClick={() => setItemDialog({ item: row.item, day })}><Pencil /></Button>
                          <Button size="icon-sm" variant="ghost" aria-label={t("Löschen")} onClick={() => void removeItem(row.item)}><Trash2 /></Button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>

      {itemDialog ? (
        <ItemDialog
          tourId={tour.id}
          day={itemDialog.day}
          item={itemDialog.item}
          onClose={() => setItemDialog(null)}
          onSaved={() => { setItemDialog(null); void mutate(); }}
        />
      ) : null}
      {editOpen ? <TourDialog bandId={tour.bandId} open tour={tour} onClose={() => setEditOpen(false)} onSaved={() => void mutate()} /> : null}
      {assignOpen ? <AssignDialog data={data} onClose={() => setAssignOpen(false)} onSaved={() => { setAssignOpen(false); void mutate(); }} /> : null}
    </>
  );
}

function ItemDialog({ tourId, day, item, onClose, onSaved }: { tourId: string; day: string; item: TourItem | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [kind, setKind] = useState<ItemKind>(item?.kind ?? "travel");
  const [title, setTitle] = useState(item?.title ?? "");
  const [startsAt, setStartsAt] = useState(item ? toLocalInput(item.startsAt) : `${day}T10:00`);
  const [endsAt, setEndsAt] = useState(toLocalInput(item?.endsAt ?? null));
  const [location, setLocation] = useState(item?.location ?? "");
  const [toLocation, setToLocation] = useState(item?.toLocation ?? "");
  const [distance, setDistance] = useState(item?.distanceKm ? String(item.distanceKm) : "");
  const [bookingRef, setBookingRef] = useState(item?.bookingRef ?? "");
  const [cost, setCost] = useState(item?.costCents ? String(item.costCents / 100).replace(".", ",") : "");
  const [details, setDetails] = useState(item?.details ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const costValue = Number(cost.replace(/\./g, "").replace(",", "."));
      const body = {
        kind,
        title: title.trim() || KIND_LABEL[kind],
        startsAt: new Date(startsAt).toISOString(),
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        location: location || null,
        toLocation: kind === "travel" ? toLocation || null : null,
        distanceKm: kind === "travel" && distance ? Math.round(Number(distance)) : null,
        bookingRef: bookingRef || null,
        costCents: cost.trim() && Number.isFinite(costValue) ? Math.round(costValue * 100) : null,
        details: details || null,
      };
      if (item) await api.patch(`/api/tours/${tourId}/items/${item.id}`, body);
      else await api.post(`/api/tours/${tourId}/items`, body);
      onSaved();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const placeholders: Record<ItemKind, string> = {
    travel: t("z. B. Sprinter, Abfahrt Proberaum"),
    accommodation: t("z. B. Hotel Am Hafen"),
    meal: t("z. B. Catering im Club"),
    appointment: t("z. B. Radio-Interview"),
    note: t("z. B. Merch nachzählen"),
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={item ? t("Eintrag bearbeiten") : t("Neuer Eintrag")}
      size="lg"
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>{t("Abbrechen")}</Button>
          <Button variant="primary" loading={saving} disabled={!startsAt} onClick={() => void save()}>{t("Speichern")}</Button>
        </>
      )}
    >
      <div className="space-y-4">
        <Segmented value={kind} onChange={setKind} items={(Object.keys(KIND_LABEL) as ItemKind[]).map((value) => ({ value, label: KIND_LABEL[value] }))} />
        <Field label={t("Titel")}>{(id) => <Input id={id} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={placeholders[kind]} />}</Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={kind === "travel" ? t("Abfahrt") : kind === "accommodation" ? t("Check-in") : t("Beginn")}>{(id) => <Input id={id} type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />}</Field>
          <Field label={kind === "travel" ? t("Ankunft") : kind === "accommodation" ? t("Check-out") : t("Ende")} optional>{(id) => <Input id={id} type="datetime-local" value={endsAt} min={startsAt || undefined} onChange={(event) => setEndsAt(event.target.value)} />}</Field>
        </div>
        {kind === "travel" ? (
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_8rem]">
            <Field label={t("Von")}>{(id) => <Input id={id} value={location} onChange={(event) => setLocation(event.target.value)} placeholder={t("Hamburg")} />}</Field>
            <Field label={t("Nach")}>{(id) => <Input id={id} value={toLocation} onChange={(event) => setToLocation(event.target.value)} placeholder={t("Kiel")} />}</Field>
            <Field label={t("Strecke (km)")} optional>{(id) => <Input id={id} inputMode="numeric" value={distance} onChange={(event) => setDistance(event.target.value.replace(/[^\d]/g, ""))} />}</Field>
          </div>
        ) : kind !== "note" ? (
          <Field label={t("Adresse / Ort")} optional>{(id) => <Input id={id} value={location} onChange={(event) => setLocation(event.target.value)} />}</Field>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("Buchungsnummer")} optional>{(id) => <Input id={id} value={bookingRef} onChange={(event) => setBookingRef(event.target.value)} />}</Field>
          <Field label={t("Kosten (€)")} optional>{(id) => <Input id={id} inputMode="decimal" value={cost} onChange={(event) => setCost(event.target.value)} placeholder="0,00" />}</Field>
        </div>
        <Field label={t("Details")} optional>{(id) => <Textarea id={id} rows={3} value={details} onChange={(event) => setDetails(event.target.value)} placeholder={t("Parken, Zimmeraufteilung, Telefonnummern …")} />}</Field>
      </div>
    </Dialog>
  );
}

function AssignDialog({ data, onClose, onSaved }: { data: TourData; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [selected, setSelected] = useState(() => new Set(data.events.map((event) => event.id)));
  const [saving, setSaving] = useState(false);
  const options = [...new Map([...data.candidates, ...data.events].map((event) => [event.id, event])).values()]
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/api/tours/${data.tour.id}/events`, { eventIds: [...selected] });
      onSaved();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("Gigs zuordnen")}
      description={t("Termine aus dem Kalender im Zeitraum der Tour.")}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>{t("Abbrechen")}</Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>{t("Übernehmen")}</Button>
        </>
      )}
    >
      {options.length === 0 ? <p className="text-sm text-muted">{t("Keine Termine in diesem Zeitraum.")}</p> : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {options.map((event) => (
            <li key={event.id}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--accent)]"
                  checked={selected.has(event.id)}
                  onChange={(change) => setSelected((current) => {
                    const next = new Set(current);
                    if (change.target.checked) next.add(event.id);
                    else next.delete(event.id);
                    return next;
                  })}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{event.title}</span>
                  <span className="type-meta text-[11px] text-muted">
                    {new Date(event.startsAt).toLocaleDateString(intlLocale(), { weekday: "short", day: "numeric", month: "short" })}{event.venueLabel ? ` · ${event.venueLabel}` : ""}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
