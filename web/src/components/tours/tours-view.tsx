"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { MapPin, Plus, Route } from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import { cn } from "@/lib/client/cn";
import { intlLocale, t } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, PageHeader, SkeletonList } from "@/components/ui/display";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/feedback";
import { useSession } from "@/components/providers/session";

export type TourSummary = {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  notes: string | null;
  gigs: number;
  venues: string[];
  distanceKm: number;
  costCents: number;
};

export function formatDayRange(startsOn: string, endsOn: string): string {
  const format = (key: string, options: Intl.DateTimeFormatOptions) => new Date(`${key}T12:00:00Z`).toLocaleDateString(intlLocale(), { timeZone: "UTC", ...options });
  if (startsOn === endsOn) return format(startsOn, { day: "numeric", month: "short", year: "numeric" });
  return `${format(startsOn, { day: "numeric", month: "short" })} – ${format(endsOn, { day: "numeric", month: "short", year: "numeric" })}`;
}

export function money(cents: number): string {
  return new Intl.NumberFormat(intlLocale(), { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(cents / 100);
}

function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Tours of the band: gigs of a period with travel, accommodation and day schedule. */
export function ToursView() {
  const { bandId, can } = useSession();
  const { data, isLoading } = useSWR<{ tours: TourSummary[] }>(bandId ? `/api/bands/${bandId}/tours` : null);
  const [creating, setCreating] = useState(false);
  const manage = can("events.manage");
  const tours = data?.tours ?? [];
  const today = todayKey();

  return (
    <>
      <PageHeader
        title={t("Touren")}
        description={t("Gigs, Fahrten, Unterkünfte und Tagesablauf einer Tour an einem Ort – als Tourplan zum Ausdrucken.")}
        actions={manage ? <Button variant="primary" icon={<Plus />} onClick={() => setCreating(true)}>{t("Neue Tour")}</Button> : null}
      />
      {isLoading ? <SkeletonList rows={3} /> : tours.length === 0 ? (
        <EmptyState
          icon={<Route />}
          title={t("Noch keine Touren")}
          description={t("Leg eine Tour mit Zeitraum an – Gigs aus dem Kalender in diesem Zeitraum werden automatisch zugeordnet.")}
          action={manage ? <Button variant="primary" icon={<Plus />} onClick={() => setCreating(true)}>{t("Tour planen")}</Button> : undefined}
        />
      ) : (
        <ul className="stagger grid gap-4 md:grid-cols-2">
          {tours.map((tour) => {
            const state = tour.endsOn < today ? "past" : tour.startsOn <= today ? "live" : "upcoming";
            return (
              <li key={tour.id}>
                <Link href={`/app/tours/${tour.id}`} className="block h-full">
                  <Card className={cn("h-full transition-[border-color,transform] duration-300 hover:-translate-y-0.5 hover:border-fg/20", state === "past" && "opacity-70")}>
                    <p className="type-eyebrow flex items-center gap-2 text-muted">
                      {state === "live" ? <span className="led size-1.5 rounded-full bg-accent" /> : null}
                      {state === "live" ? t("Läuft gerade") : state === "past" ? t("Vorbei") : t("Geplant")} · {formatDayRange(tour.startsOn, tour.endsOn)}
                    </p>
                    <h2 className="type-display mt-2 text-[26px] leading-tight">{tour.name}</h2>
                    {tour.venues.length > 0 ? (
                      <p className="mt-2 flex items-center gap-1.5 truncate text-sm text-muted"><MapPin className="size-3.5 shrink-0" />{tour.venues.join(" · ")}</p>
                    ) : null}
                    <dl className="type-meta mt-5 grid grid-cols-3 gap-3 border-t border-border pt-4 text-[11px] text-muted">
                      <div><dt>{t("Gigs")}</dt><dd className="type-display mt-1 text-[22px] text-fg">{tour.gigs}</dd></div>
                      <div><dt>{t("Strecke")}</dt><dd className="type-display mt-1 text-[22px] text-fg">{tour.distanceKm ? `${tour.distanceKm} km` : "–"}</dd></div>
                      <div><dt>{t("Kosten")}</dt><dd className="type-display mt-1 text-[22px] text-fg">{tour.costCents ? money(tour.costCents) : "–"}</dd></div>
                    </dl>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {bandId ? <TourDialog bandId={bandId} open={creating} onClose={() => setCreating(false)} /> : null}
    </>
  );
}

/** Create a tour (or edit name/period/notes when `tour` is given). */
export function TourDialog({ bandId, open, onClose, tour, onSaved }: {
  bandId: string;
  open: boolean;
  onClose: () => void;
  tour?: { id: string; name: string; startsOn: string; endsOn: string; notes: string | null };
  onSaved?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(tour?.name ?? "");
  const [startsOn, setStartsOn] = useState(tour?.startsOn ?? "");
  const [endsOn, setEndsOn] = useState(tour?.endsOn ?? "");
  const [notes, setNotes] = useState(tour?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      const body = { name, startsOn, endsOn: endsOn || startsOn, notes: notes.trim() || null };
      if (tour) {
        await api.patch(`/api/tours/${tour.id}`, body);
        toast.success(t("Tour gespeichert."));
        onSaved?.();
        onClose();
      } else {
        const result = await api.post<{ tour: { id: string } }>(`/api/bands/${bandId}/tours`, body);
        router.push(`/app/tours/${result.tour.id}`);
      }
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={tour ? t("Tour bearbeiten") : t("Neue Tour")}
      description={tour ? undefined : t("Gigs aus dem Kalender in diesem Zeitraum werden automatisch zugeordnet.")}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>{t("Abbrechen")}</Button>
          <Button variant="primary" loading={saving} disabled={!name.trim() || !startsOn} onClick={() => void submit()}>{tour ? t("Speichern") : t("Tour anlegen")}</Button>
        </>
      )}
    >
      <div className="space-y-4">
        <Field label={t("Name")}>{(id) => <Input id={id} value={name} onChange={(event) => setName(event.target.value)} placeholder={t("z. B. Herbsttour Norddeutschland")} autoFocus />}</Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("Von")}>{(id) => <Input id={id} type="date" value={startsOn} onChange={(event) => setStartsOn(event.target.value)} />}</Field>
          <Field label={t("Bis")}>{(id) => <Input id={id} type="date" value={endsOn} min={startsOn || undefined} onChange={(event) => setEndsOn(event.target.value)} />}</Field>
        </div>
        <Field label={t("Notizen")} optional>{(id) => <Textarea id={id} rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={t("Crew, Fahrzeug, Merch, Ansprechpartner:innen …")} />}</Field>
      </div>
    </Dialog>
  );
}
