"use client";

import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import { EVENT_KIND_LABEL, EVENT_STATUS_LABEL, toDateKey } from "@/lib/client/format";
import { useSetlists } from "@/lib/client/hooks";
import { useRevalidate } from "@/lib/client/mutations";
import type { BandEvent, EventKind, EventStatus } from "@/lib/client/types";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Segmented } from "@/components/ui/navigation";
import { useToast } from "@/components/ui/feedback";
import { useSession } from "@/components/providers/session";

export type EventDraft = { date?: string; start?: string; end?: string; kind?: EventKind; title?: string };

type Recurrence = "none" | "weekly" | "biweekly" | "daily";

function timeOf(iso: string): string {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function defaultTitle(kind: EventKind) {
  return kind === "rehearsal" ? "Probe" : kind === "gig" ? "" : kind === "meeting" ? "Bandmeeting" : "";
}

function EventForm({ event, draft, onClose }: { event: BandEvent | null; draft: EventDraft | null; onClose: () => void }) {
  const { bandId } = useSession();
  const setlists = useSetlists(bandId);
  const toast = useToast();
  const revalidate = useRevalidate();
  const initialKind = event?.kind ?? draft?.kind ?? "rehearsal";

  const [kind, setKind] = useState<EventKind>(initialKind);
  const [title, setTitle] = useState(event?.title ?? draft?.title ?? defaultTitle(initialKind));
  const [date, setDate] = useState(event ? toDateKey(new Date(event.startsAt)) : draft?.date ?? toDateKey(new Date()));
  const [start, setStart] = useState(event ? timeOf(event.startsAt) : draft?.start ?? "19:00");
  const [end, setEnd] = useState(event?.endsAt ? timeOf(event.endsAt) : draft?.end ?? (initialKind === "rehearsal" ? "22:00" : ""));
  const [venue, setVenue] = useState(event?.venueLabel ?? "");
  const [notes, setNotes] = useState(event?.notes ?? "");
  const [status, setStatus] = useState<EventStatus>(event?.status ?? "planned");
  const [setlistId, setSetlistId] = useState(event?.setlistId ?? "");
  const [recurrence, setRecurrence] = useState<Recurrence>("none");
  const [count, setCount] = useState("8");
  const [applyToSeries, setApplyToSeries] = useState(false);
  const [saving, setSaving] = useState(false);
  const [venueQuery, setVenueQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);

  // Address suggestions via OpenStreetMap (debounced; only after typing).
  useEffect(() => {
    const query = venueQuery.trim();
    if (query.length < 4) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=4&q=${encodeURIComponent(query)}`, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      })
        .then((response) => response.json() as Promise<Array<{ display_name?: string }>>)
        .then((data) => setSuggestions(data.map((entry) => entry.display_name ?? "").filter(Boolean)))
        .catch(() => undefined);
    }, 350);
    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [venueQuery]);

  const submit = async () => {
    if (!title.trim() || !date || !start || !bandId) return;
    const startsAt = new Date(`${date}T${start}`);
    let endsAt: Date | null = end ? new Date(`${date}T${end}`) : null;
    if (endsAt && endsAt <= startsAt) {
      endsAt = new Date(endsAt.getTime() + 24 * 60 * 60 * 1000); // ends after midnight
    }
    const payload = {
      title: title.trim(),
      kind,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt?.toISOString() ?? null,
      venueLabel: venue.trim() || null,
      notes: notes.trim() || null,
      status,
      setlistId: setlistId || null,
    };

    setSaving(true);
    try {
      if (event) {
        await api.patch(`/api/events/${event.id}`, { ...payload, scope: applyToSeries ? "series" : "single" });
        toast.success("Termin gespeichert.");
      } else {
        const recurrenceEveryDays = recurrence === "weekly" ? 7 : recurrence === "biweekly" ? 14 : recurrence === "daily" ? 1 : null;
        const result = await api.post<{ events: unknown[] }>("/api/events", {
          bandId,
          ...payload,
          recurrenceEveryDays,
          recurrenceCount: recurrenceEveryDays ? Math.min(104, Math.max(2, Number(count) || 2)) : null,
        });
        toast.success(result.events.length > 1 ? `${result.events.length} Termine angelegt.` : "Termin angelegt – die Band wird benachrichtigt.");
      }
      await revalidate("/api/calendar/overview", "/api/events", "/api/setlists");
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={(evt) => { evt.preventDefault(); void submit(); }}>
      <Segmented
        className="w-full"
        value={kind}
        onChange={(value) => {
          if (!title.trim() || title === defaultTitle(kind)) setTitle(defaultTitle(value));
          setKind(value);
        }}
        items={(Object.keys(EVENT_KIND_LABEL) as EventKind[]).map((value) => ({ value, label: EVENT_KIND_LABEL[value] }))}
      />
      <Field label="Titel">
        {(id) => <Input id={id} autoFocus value={title} onChange={(evt) => setTitle(evt.target.value)} placeholder={kind === "gig" ? "z. B. Clubshow im Molotow" : "Titel"} required />}
      </Field>
      <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-2">
        <Field label="Datum">{(id) => <Input id={id} type="date" value={date} onChange={(evt) => setDate(evt.target.value)} required />}</Field>
        <Field label="Von">{(id) => <Input id={id} type="time" value={start} onChange={(evt) => setStart(evt.target.value)} required />}</Field>
        <Field label="Bis">{(id) => <Input id={id} type="time" value={end} onChange={(evt) => setEnd(evt.target.value)} />}</Field>
      </div>
      <Field label="Ort" optional>
        {(id) => (
          <div className="relative">
            <MapPin className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
            <Input
              id={id}
              value={venue}
              onChange={(evt) => {
                setVenue(evt.target.value);
                setVenueQuery(evt.target.value);
                if (evt.target.value.trim().length < 4) setSuggestions([]);
              }}
              placeholder="Proberaum, Club oder Adresse"
              className="pl-9"
              autoComplete="off"
            />
            {suggestions.length > 0 ? (
              <ul className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-float">
                {suggestions.map((suggestion) => (
                  <li key={suggestion}>
                    <button
                      type="button"
                      className="w-full truncate rounded-lg px-2.5 py-2 text-left text-sm hover:bg-surface-2"
                      onClick={() => {
                        setVenue(suggestion);
                        setSuggestions([]);
                        setVenueQuery("");
                      }}
                    >
                      {suggestion}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Status">
          {(id) => (
            <Select id={id} value={status} onChange={(evt) => setStatus(evt.target.value as EventStatus)}>
              {(Object.keys(EVENT_STATUS_LABEL) as EventStatus[]).map((value) => <option key={value} value={value}>{EVENT_STATUS_LABEL[value]}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Setlist" optional>
          {(id) => (
            <Select id={id} value={setlistId} onChange={(evt) => setSetlistId(evt.target.value)}>
              <option value="">Keine</option>
              {(setlists.data?.setlists ?? []).map((setlist) => <option key={setlist.id} value={setlist.id}>{setlist.name}</option>)}
            </Select>
          )}
        </Field>
      </div>
      {!event ? (
        <div className="grid grid-cols-[1fr_auto] items-end gap-2">
          <Field label="Wiederholen">
            {(id) => (
              <Select id={id} value={recurrence} onChange={(evt) => setRecurrence(evt.target.value as Recurrence)}>
                <option value="none">Einmalig</option>
                <option value="weekly">Jede Woche</option>
                <option value="biweekly">Alle 2 Wochen</option>
                <option value="daily">Täglich</option>
              </Select>
            )}
          </Field>
          {recurrence !== "none" ? (
            <Field label="Anzahl">{(id) => <Input id={id} type="number" min={2} max={104} value={count} onChange={(evt) => setCount(evt.target.value)} className="w-24" />}</Field>
          ) : null}
        </div>
      ) : event.recurrenceGroupId ? (
        <label className="flex items-center gap-2.5 rounded-xl bg-surface-2 px-3 py-2.5 text-sm">
          <input type="checkbox" checked={applyToSeries} onChange={(evt) => setApplyToSeries(evt.target.checked)} className="size-4 accent-[var(--accent)]" />
          Titel, Ort, Typ und Notizen für die ganze Serie übernehmen
        </label>
      ) : null}
      <Field label="Notizen" optional>
        {(id) => <Textarea id={id} rows={3} value={notes} onChange={(evt) => setNotes(evt.target.value)} placeholder="Soundcheck 18:00, Backline vorhanden, Gage …" />}
      </Field>
      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <Button onClick={onClose}>Abbrechen</Button>
        <Button type="submit" variant="primary" loading={saving} disabled={!title.trim()}>{event ? "Speichern" : "Termin anlegen"}</Button>
      </div>
    </form>
  );
}

export function EventDialog({ open, onClose, event, draft }: { open: boolean; onClose: () => void; event: BandEvent | null; draft: EventDraft | null }) {
  return (
    <Dialog open={open} onClose={onClose} title={event ? "Termin bearbeiten" : "Neuer Termin"}>
      {open ? <EventForm key={event?.id ?? JSON.stringify(draft)} event={event} draft={draft} onClose={onClose} /> : null}
    </Dialog>
  );
}
