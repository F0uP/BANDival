"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  ArrowLeft, CalendarCheck, ClipboardList, FileDown, FileText, Guitar, ListMusic, MapPin, Plus, Sparkles, Star, Wand2, X,
} from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import { cn } from "@/lib/client/cn";
import { EVENT_KIND_LABEL, formatDateLong, formatTimeRange, formatTotalDuration } from "@/lib/client/format";
import { useAiStatus, useSongs } from "@/lib/client/hooks";
import { useRevalidate } from "@/lib/client/mutations";
import { Button, ButtonLink } from "@/components/ui/button";
import { Avatar, Badge, Card, CardHeader, EmptyState, Skeleton } from "@/components/ui/display";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/form";
import { Tabs } from "@/components/ui/navigation";
import { useToast } from "@/components/ui/feedback";
import { useSession } from "@/components/providers/session";
import { EventKindIcon } from "@/components/calendar/event-bits";

type Detail = {
  event: {
    id: string;
    bandId: string;
    title: string;
    kind: "rehearsal" | "gig" | "meeting" | "other";
    startsAt: string;
    endsAt: string | null;
    venueLabel: string | null;
    notes: string | null;
    status: string;
    isPublic: boolean;
    contactName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    feeCents: number | null;
    feeStatus: string | null;
    loadInAt: string | null;
    soundcheckAt: string | null;
    doorsAt: string | null;
    setlist: { id: string; name: string; items: Array<{ song: { id: string; title: string; durationSeconds: number | null } }> } | null;
    log: { notes: string; updatedAt: string; updatedBy: { displayName: string } | null } | null;
    logSongs: Array<{ songId: string; rating: number | null; note: string | null; song: { id: string; title: string } }>;
    attendance: Array<{ userId: string; present: boolean }>;
    availabilities: Array<{ userId: string; status: string | null }>;
    transactions: Array<{ id: string; amountCents: number; description: string | null }>;
  };
  members: Array<{ userId: string; role: string; instrumentPrimary: string | null; user: { displayName: string; avatarUrl: string | null } }>;
  band: { name: string; timezone: string } | null;
};

type PlanEntry = { song: { id: string; title: string; durationSeconds: number | null; keySignature: string | null }; score: number; reasons: string[]; minutes: number };

function toLocalInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalInput(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

function Stars({ value, onChange }: { value: number | null; onChange: (value: number | null) => void }) {
  return (
    <span className="inline-flex" role="radiogroup" aria-label="Bewertung">
      {[1, 2, 3, 4, 5].map((star) => (
        <button key={star} type="button" onClick={() => onChange(value === star ? null : star)} aria-label={`${star} Sterne`} className="p-0.5">
          <Star className={cn("size-4", value !== null && star <= value ? "fill-warning text-warning" : "text-subtle")} />
        </button>
      ))}
    </span>
  );
}

function ProtocolTab({ detail, onSaved }: { detail: Detail; onSaved: () => void }) {
  const { band, bandId, can } = useSession();
  const songs = useSongs(bandId);
  const ai = useAiStatus();
  const toast = useToast();
  const event = detail.event;
  const initialSongs = event.logSongs.length
    ? event.logSongs.map((entry) => ({ songId: entry.songId, title: entry.song.title, rating: entry.rating, note: entry.note ?? "" }))
    : (event.setlist?.items ?? []).map((item) => ({ songId: item.song.id, title: item.song.title, rating: null as number | null, note: "" }));
  const [notes, setNotes] = useState(event.log?.notes ?? "");
  const [played, setPlayed] = useState(initialSongs);
  const [attendance, setAttendance] = useState<Record<string, boolean>>(() => Object.fromEntries(detail.members.map((member) => {
    const explicit = event.attendance.find((entry) => entry.userId === member.userId);
    const rsvp = event.availabilities.find((entry) => entry.userId === member.userId)?.status;
    return [member.userId, explicit ? explicit.present : rsvp !== "unavailable"];
  })));
  const [adding, setAdding] = useState("");
  const [saving, setSaving] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const editable = can("events.log");

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/api/events/${event.id}/log`, {
        notes,
        songs: played.map((entry) => ({ songId: entry.songId, rating: entry.rating, note: entry.note.trim() || null })),
        attendance: Object.entries(attendance).map(([userId, present]) => ({ userId, present })),
      });
      toast.success("Protokoll gespeichert.");
      onSaved();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const summarize = async () => {
    if (!bandId) return;
    setSummarizing(true);
    try {
      const text = [
        `Termin: ${event.title} (${formatDateLong(event.startsAt)})`,
        `Notizen:\n${notes}`,
        `Songs:\n${played.map((entry) => `- ${entry.title}${entry.rating ? ` (${entry.rating}/5)` : ""}${entry.note ? `: ${entry.note}` : ""}`).join("\n")}`,
      ].join("\n\n");
      const result = await api.post<{ summary: string }>("/api/ai/assist", { task: "summary", bandId, text });
      setNotes((current) => `${current.trim()}\n\n## Zusammenfassung (KI)\n${result.summary}`.trim());
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSummarizing(false);
    }
  };

  const available = (songs.data?.songs ?? []).filter((song) => !played.some((entry) => entry.songId === song.id));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="space-y-6">
        <Card>
          <CardHeader
            title="Notizen"
            description={event.log?.updatedBy ? `Zuletzt von ${event.log.updatedBy.displayName}` : "Was lief gut, was üben wir, was ist zu tun?"}
            action={ai.data?.enabled && editable ? <Button size="sm" variant="ghost" icon={<Sparkles />} loading={summarizing} onClick={() => void summarize()}>Zusammenfassen</Button> : null}
          />
          <Textarea rows={10} value={notes} onChange={(changeEvent) => setNotes(changeEvent.target.value)} disabled={!editable} placeholder={"- Intro von Song X sitzt jetzt\n- Bridge in Song Y nochmal langsam üben\n- Nächstes Mal: neue Gitarren-Sounds testen"} />
        </Card>
        <Card>
          <CardHeader title="Gespielte Songs" description="Bewertung hilft dem Probenplaner beim nächsten Mal." />
          {played.length === 0 ? <p className="mb-3 text-sm text-muted">Noch keine Songs eingetragen.</p> : null}
          <ul className="divide-y divide-border">
            {played.map((entry, position) => (
              <li key={entry.songId} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center">
                <Link href={`/app/songs/${entry.songId}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">{entry.title}</Link>
                <Stars value={entry.rating} onChange={(rating) => setPlayed((current) => current.map((item, index) => (index === position ? { ...item, rating } : item)))} />
                <Input
                  value={entry.note}
                  onChange={(changeEvent) => setPlayed((current) => current.map((item, index) => (index === position ? { ...item, note: changeEvent.target.value } : item)))}
                  placeholder="Notiz"
                  className="h-9 sm:w-56"
                  disabled={!editable}
                />
                {editable ? (
                  <button type="button" onClick={() => setPlayed((current) => current.filter((_, index) => index !== position))} className="self-end rounded-lg p-1.5 text-subtle hover:text-danger sm:self-auto" aria-label="Entfernen">
                    <X className="size-4" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          {editable ? (
            <div className="mt-3 flex gap-2">
              <Select value={adding} onChange={(changeEvent) => setAdding(changeEvent.target.value)} className="h-9" aria-label="Song hinzufügen">
                <option value="">Song hinzufügen …</option>
                {available.map((song) => <option key={song.id} value={song.id}>{song.title}</option>)}
              </Select>
              <Button size="sm" icon={<Plus />} disabled={!adding} onClick={() => {
                const song = available.find((entry) => entry.id === adding);
                if (song) setPlayed((current) => [...current, { songId: song.id, title: song.title, rating: null, note: "" }]);
                setAdding("");
              }}>Hinzufügen</Button>
            </div>
          ) : null}
        </Card>
      </div>
      <div className="space-y-6">
        <Card>
          <CardHeader title="Anwesenheit" description={`${Object.values(attendance).filter(Boolean).length} von ${detail.members.length}`} />
          <ul className="space-y-1">
            {detail.members.map((member) => (
              <li key={member.userId}>
                <label className="flex items-center gap-2.5 rounded-lg px-1 py-1.5 hover:bg-surface-2">
                  <input type="checkbox" checked={attendance[member.userId] ?? false} disabled={!editable} onChange={(changeEvent) => setAttendance((current) => ({ ...current, [member.userId]: changeEvent.target.checked }))} />
                  <Avatar name={member.user.displayName} src={member.user.avatarUrl} size="xs" />
                  <span className="min-w-0 flex-1 truncate text-sm">{member.user.displayName}</span>
                  {member.instrumentPrimary ? <span className="truncate text-xs text-muted">{member.instrumentPrimary}</span> : null}
                </label>
              </li>
            ))}
          </ul>
        </Card>
        {editable ? <Button variant="primary" className="w-full" loading={saving} onClick={() => void save()}>Protokoll speichern</Button> : null}
        <p className="text-xs text-subtle">{band?.name}</p>
      </div>
    </div>
  );
}

function PlanTab({ eventId, onSaved }: { eventId: string; onSaved: () => void }) {
  const { data, error, isLoading } = useSWR<{ lengthMinutes: number; plannedMinutes: number; plan: PlanEntry[]; more: number }>(`/api/events/${eventId}/plan`);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const { can } = useSession();
  const toast = useToast();
  const router = useRouter();
  const revalidate = useRevalidate();
  if (isLoading) return <Skeleton className="h-60" />;
  if (error || !data) return <EmptyState icon={<Wand2 />} title="Kein Plan" description={errorMessage(error)} />;
  const plan = data.plan.filter((entry) => !removed.has(entry.song.id));

  const save = async () => {
    setSaving(true);
    try {
      const result = await api.post<{ setlistId: string }>(`/api/events/${eventId}/plan`, { songIds: plan.map((entry) => entry.song.id) });
      await revalidate("/api/setlists", "/api/calendar/overview");
      onSaved();
      router.push(`/app/setlists/${result.setlistId}`);
    } catch (failure) {
      toast.error(errorMessage(failure));
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Probenplan-Vorschlag"
        icon={<Wand2 />}
        description={`${plan.reduce((sum, entry) => sum + entry.minutes, 0)} von ${data.lengthMinutes} Minuten · berücksichtigt nächste Gigs, Song-Status, letzte Bewertungen und offene Aufgaben`}
        action={can("setlists.create") && plan.length ? <Button size="sm" variant="primary" icon={<ListMusic />} loading={saving} onClick={() => void save()}>Als Setlist speichern</Button> : null}
      />
      {plan.length === 0 ? <p className="text-sm text-muted">Alles im grünen Bereich – nichts Dringendes zu proben. 🎉</p> : (
        <ol className="divide-y divide-border">
          {plan.map((entry, position) => (
            <li key={entry.song.id} className="flex items-start gap-3 py-2.5">
              <span className="w-5 pt-0.5 text-right text-sm tabular-nums text-subtle">{position + 1}</span>
              <div className="min-w-0 flex-1">
                <Link href={`/app/songs/${entry.song.id}`} className="font-medium hover:underline">{entry.song.title}</Link>
                <div className="mt-1 flex flex-wrap gap-1">
                  {entry.reasons.map((reason) => <Badge key={reason}>{reason}</Badge>)}
                </div>
              </div>
              <span className="shrink-0 text-xs tabular-nums text-muted">~{entry.minutes} min</span>
              <button type="button" onClick={() => setRemoved((current) => new Set(current).add(entry.song.id))} className="rounded-lg p-1 text-subtle hover:text-danger" aria-label="Entfernen">
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

type GigInvoice = { id: string; eventId: string | null; status: string; number: string | null; grossCents: number; cancelsNumber: string | null };

function GigInvoices({ eventId, bandId }: { eventId: string; bandId: string }) {
  const { can } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const { data } = useSWR<{ invoices: GigInvoice[] }>(can("finance.view") ? `/api/bands/${bandId}/invoices` : null);
  if (!can("finance.view")) return null;
  const invoices = (data?.invoices ?? []).filter((invoice) => invoice.eventId === eventId);
  const label: Record<string, string> = { draft: "Entwurf", issued: "Gestellt", paid: "Bezahlt", cancelled: "Storniert" };

  const create = async () => {
    setCreating(true);
    try {
      const result = await api.post<{ invoice: { id: string } }>(`/api/bands/${bandId}/invoices`, { eventId });
      router.push(`/app/finance/invoices/${result.invoice.id}`);
    } catch (error) {
      toast.error(errorMessage(error));
      setCreating(false);
    }
  };

  return (
    <Card className="lg:col-span-2">
      <CardHeader
        title="Rechnung"
        icon={<FileText />}
        description="Veranstalter, Datum und Gage werden übernommen – mit fortlaufender Nummer, allen Pflichtangaben und GiroCode."
        action={can("finance.manage") ? <Button size="sm" variant={invoices.length ? "secondary" : "primary"} icon={<Plus />} loading={creating} onClick={() => void create()}>Rechnung erstellen</Button> : null}
      />
      {invoices.length ? (
        <ul className="space-y-2 text-sm">
          {invoices.map((invoice) => (
            <li key={invoice.id} className="flex items-center justify-between gap-2">
              <Link href={`/app/finance/invoices/${invoice.id}`} className="min-w-0 truncate hover:underline">{invoice.cancelsNumber ? "Storno " : ""}{invoice.number ?? "Entwurf"}</Link>
              <span className="flex items-center gap-2"><Badge tone={invoice.status === "paid" ? "success" : invoice.status === "issued" ? "warning" : "neutral"}>{label[invoice.status] ?? invoice.status}</Badge><span className="tabular-nums">{(invoice.grossCents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</span></span>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

function GigTab({ detail, onSaved }: { detail: Detail; onSaved: () => void }) {
  const { can } = useSession();
  const toast = useToast();
  const event = detail.event;
  const [values, setValues] = useState({
    contactName: event.contactName ?? "",
    contactEmail: event.contactEmail ?? "",
    contactPhone: event.contactPhone ?? "",
    fee: event.feeCents !== null ? (event.feeCents / 100).toFixed(2).replace(".", ",") : "",
    feeStatus: event.feeStatus ?? "open",
    loadInAt: toLocalInput(event.loadInAt),
    soundcheckAt: toLocalInput(event.soundcheckAt),
    doorsAt: toLocalInput(event.doorsAt),
    isPublic: event.isPublic,
  });
  const [saving, setSaving] = useState(false);
  const manage = can("events.manage");
  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => setValues((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setSaving(true);
    const fee = values.fee.trim() ? Math.round(Number(values.fee.replace(/\./g, "").replace(",", ".")) * 100) : null;
    try {
      await api.patch(`/api/events/${event.id}/details`, {
        contactName: values.contactName || null,
        contactEmail: values.contactEmail || null,
        contactPhone: values.contactPhone || null,
        feeCents: Number.isFinite(fee) ? fee : null,
        feeStatus: values.feeStatus,
        loadInAt: fromLocalInput(values.loadInAt),
        soundcheckAt: fromLocalInput(values.soundcheckAt),
        doorsAt: fromLocalInput(values.doorsAt),
        isPublic: values.isPublic,
      });
      toast.success(values.feeStatus === "paid" ? "Gespeichert – Gage ist in der Bandkasse verbucht." : "Gig-Details gespeichert.");
      onSaved();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="Ablauf" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Field label="Load-in">{(id) => <Input id={id} type="datetime-local" disabled={!manage} value={values.loadInAt} onChange={(changeEvent) => set("loadInAt", changeEvent.target.value)} />}</Field>
          <Field label="Soundcheck">{(id) => <Input id={id} type="datetime-local" disabled={!manage} value={values.soundcheckAt} onChange={(changeEvent) => set("soundcheckAt", changeEvent.target.value)} />}</Field>
          <Field label="Einlass">{(id) => <Input id={id} type="datetime-local" disabled={!manage} value={values.doorsAt} onChange={(changeEvent) => set("doorsAt", changeEvent.target.value)} />}</Field>
        </div>
        <div className="mt-4">
          <Switch checked={values.isPublic} disabled={!manage} onChange={(value) => set("isPublic", value)} label="Auf der öffentlichen Bandseite zeigen" description="Erscheint in der Konzertliste und im öffentlichen Kalender-Abo." />
        </div>
      </Card>
      <Card>
        <CardHeader title="Veranstalter & Gage" />
        <div className="space-y-3">
          <Field label="Ansprechpartner:in">{(id) => <Input id={id} disabled={!manage} value={values.contactName} onChange={(changeEvent) => set("contactName", changeEvent.target.value)} />}</Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="E-Mail">{(id) => <Input id={id} type="email" disabled={!manage} value={values.contactEmail} onChange={(changeEvent) => set("contactEmail", changeEvent.target.value)} />}</Field>
            <Field label="Telefon">{(id) => <Input id={id} type="tel" disabled={!manage} value={values.contactPhone} onChange={(changeEvent) => set("contactPhone", changeEvent.target.value)} />}</Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Gage (€)">{(id) => <Input id={id} inputMode="decimal" disabled={!manage} value={values.fee} onChange={(changeEvent) => set("fee", changeEvent.target.value)} placeholder="350,00" />}</Field>
            <Field label="Status">
              {(id) => (
                <Select id={id} disabled={!manage} value={values.feeStatus} onChange={(changeEvent) => set("feeStatus", changeEvent.target.value)}>
                  <option value="open">Offen</option>
                  <option value="invoiced">Rechnung gestellt</option>
                  <option value="paid">Bezahlt</option>
                  <option value="none">Ohne Gage</option>
                </Select>
              )}
            </Field>
          </div>
          {values.contactEmail || values.contactPhone ? (
            <p className="flex gap-3 text-sm">
              {values.contactEmail ? <a className="text-accent-text hover:underline" href={`mailto:${values.contactEmail}`}>E-Mail schreiben</a> : null}
              {values.contactPhone ? <a className="text-accent-text hover:underline" href={`tel:${values.contactPhone}`}>Anrufen</a> : null}
            </p>
          ) : null}
        </div>
        {manage ? <div className="mt-4 flex justify-end"><Button variant="primary" loading={saving} onClick={() => void save()}>Speichern</Button></div> : null}
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader
          title="Tech-Rider & Stage-Plot"
          icon={<Guitar />}
          description="Kanalliste, Monitormixe, Backline und Bühnenplan als PDF – mit den Zeiten dieses Gigs."
          action={(
            <div className="flex gap-2">
              <ButtonLink href="/app/band/rider" size="sm" variant="ghost">Bearbeiten</ButtonLink>
              <Button size="sm" icon={<FileDown />} onClick={() => window.open(`/api/events/${event.id}/rider`, "_blank")}>PDF</Button>
            </div>
          )}
        />
      </Card>
      <GigInvoices eventId={event.id} bandId={event.bandId} />
    </div>
  );
}

export function EventDetailView({ eventId }: { eventId: string }) {
  const { data, error, isLoading, mutate } = useSWR<Detail>(`/api/events/${eventId}/details`);
  const [tab, setTab] = useState<string | null>(null);
  const router = useRouter();
  const event = data?.event;
  const tabs = useMemo(() => {
    if (!event) return [];
    const list: Array<{ value: string; label: string }> = [];
    if (event.kind === "gig") list.push({ value: "gig", label: "Gig" });
    if (event.kind === "rehearsal") list.push({ value: "plan", label: "Probenplan" });
    list.push({ value: "protocol", label: "Protokoll" });
    return list;
  }, [event]);

  if (error) return <EmptyState icon={<CalendarCheck />} title="Termin nicht gefunden" description={errorMessage(error)} action={<Button onClick={() => router.push("/app/calendar")}>Zum Kalender</Button>} />;
  if (isLoading || !data || !event) return <div className="space-y-4"><Skeleton className="h-9 w-1/2" /><Skeleton className="h-64" /></div>;
  const active = tab ?? tabs[0]?.value ?? "protocol";
  const total = event.setlist?.items.reduce((sum, item) => sum + (item.song.durationSeconds ?? 0), 0) ?? 0;

  return (
    <div>
      <Link href="/app/calendar" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4" /> Kalender
      </Link>
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <EventKindIcon kind={event.kind} />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{event.title}</h1>
            <p className="mt-1 text-sm text-muted">{EVENT_KIND_LABEL[event.kind]} · {formatDateLong(event.startsAt)} · {formatTimeRange(event.startsAt, event.endsAt)}</p>
            {event.venueLabel ? <p className="mt-1 flex items-center gap-1 text-sm text-muted"><MapPin className="size-3.5" />{event.venueLabel}</p> : null}
          </div>
        </div>
        {event.setlist ? (
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`/app/setlists/${event.setlist.id}`} icon={<ClipboardList />}>{event.setlist.name} · {formatTotalDuration(total)}</ButtonLink>
            <ButtonLink href={`/app/setlists/${event.setlist.id}/stage`} variant="primary">Live-Modus</ButtonLink>
          </div>
        ) : null}
      </header>
      {tabs.length > 1 ? <Tabs className="mb-5" value={active} onChange={setTab} items={tabs} /> : null}
      {active === "gig" ? <GigTab detail={data} onSaved={() => void mutate()} /> : null}
      {active === "plan" ? <PlanTab eventId={eventId} onSaved={() => void mutate()} /> : null}
      {active === "protocol" ? <ProtocolTab key={event.log?.updatedAt ?? "new"} detail={data} onSaved={() => void mutate()} /> : null}
    </div>
  );
}
