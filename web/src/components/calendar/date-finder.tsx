"use client";

import { useMemo, useState } from "react";
import { CalendarPlus, Sparkles, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/client/cn";
import { formatDateLong, formatTimeRange, WEEKDAYS_SHORT } from "@/lib/client/format";
import { useDateSuggestions } from "@/lib/client/hooks";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/form";
import { Segmented } from "@/components/ui/navigation";
import { useSession } from "@/components/providers/session";
import type { EventDraft } from "@/components/calendar/event-dialog";

/** "Terminfinder": suggests the dates where most band members are free. */
export function DateFinderDialog({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (draft: EventDraft) => void }) {
  const { bandId, can } = useSession();
  const [days, setDays] = useState<"14" | "28" | "56">("28");
  const [startTime, setStartTime] = useState("19:00");
  const [endTime, setEndTime] = useState("22:00");
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);

  const params = useMemo(() => {
    if (!open || weekdays.length === 0 || !/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) return null;
    return new URLSearchParams({ days, startTime, endTime, weekdays: [...weekdays].sort().join(","), limit: "8" });
  }, [days, endTime, open, startTime, weekdays]);

  const { data, isLoading } = useDateSuggestions(bandId, params);

  return (
    <Dialog open={open} onClose={onClose} title="Terminfinder" description="Findet Tage, an denen möglichst viele können – inklusive verbundener Kalender." size="lg">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[auto_1fr_1fr]">
          <Field label="Zeitraum">
            {() => (
              <Segmented value={days} onChange={setDays} items={[{ value: "14", label: "2 Wo." }, { value: "28", label: "4 Wo." }, { value: "56", label: "8 Wo." }]} />
            )}
          </Field>
          <Field label="Von">{(id) => <Input id={id} type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />}</Field>
          <Field label="Bis">{(id) => <Input id={id} type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />}</Field>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAYS_SHORT.map((label, index) => {
            const day = index + 1;
            const active = weekdays.includes(day);
            return (
              <button
                key={label}
                type="button"
                onClick={() => setWeekdays((current) => (active ? current.filter((value) => value !== day) : [...current, day]))}
                className={cn("h-9 w-11 rounded-lg border text-sm font-medium", active ? "border-accent bg-accent-soft text-accent-text" : "border-border text-muted")}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="space-y-2">
          {isLoading || !data ? (
            [0, 1, 2].map((key) => <Skeleton key={key} className="h-16 rounded-xl" />)
          ) : data.suggestions.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">Keine passenden Tage im Zeitraum.</p>
          ) : (
            data.suggestions.map((suggestion, index) => {
              const free = suggestion.available + suggestion.maybe + suggestion.unknown;
              return (
                <div key={suggestion.date} className={cn("flex items-center gap-3 rounded-xl border px-3 py-2.5", index === 0 ? "border-accent/40 bg-accent-soft/50" : "border-border")}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {index === 0 ? <Sparkles className="size-4 text-accent-text" /> : null}
                      <span className="font-medium">{formatDateLong(suggestion.start)}</span>
                      <span className="text-xs text-muted">{formatTimeRange(suggestion.start, suggestion.end)}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                      <span className={suggestion.blocked === 0 ? "font-medium text-success" : "text-muted"}>{free}/{suggestion.total} frei</span>
                      {suggestion.available > 0 ? <span className="text-success">{suggestion.available} sicher</span> : null}
                      {suggestion.unknown > 0 ? <span className="text-muted">{suggestion.unknown} ohne Angabe</span> : null}
                      {suggestion.blockedMembers.length > 0 ? <span className="text-danger">✕ {suggestion.blockedMembers.join(", ")}</span> : null}
                      {suggestion.hasBandEvent ? <span className="flex items-center gap-1 text-warning"><TriangleAlert className="size-3" />schon ein Termin</span> : null}
                    </div>
                  </div>
                  {can("events.create") ? (
                    <Button
                      size="sm"
                      variant={index === 0 ? "primary" : "secondary"}
                      icon={<CalendarPlus />}
                      onClick={() => onPick({ date: suggestion.date, start: startTime, end: endTime, kind: "rehearsal" })}
                    >
                      <span className="hidden sm:inline">Planen</span>
                    </Button>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
        <p className="text-xs text-muted">
          Grundlage: Zu-/Absagen, markierte Tage und importierte Kalender aller Mitglieder. Personen ohne Angabe zählen als „vielleicht frei“.
        </p>
      </div>
    </Dialog>
  );
}
