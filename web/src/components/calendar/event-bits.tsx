"use client";

import { CalendarClock, Check, CircleHelp, Guitar, Mic2, Users2, X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/client/cn";
import { AVAILABILITY_LABEL, EVENT_KIND_LABEL } from "@/lib/client/format";
import type { AvailabilitySource, AvailabilityStatus, AvailabilitySummary, EventKind } from "@/lib/client/types";
import { t } from "@/lib/i18n";

export const STATUS_DOT: Record<AvailabilityStatus, string> = {
  available: "bg-success",
  maybe: "bg-warning",
  unavailable: "bg-danger",
};

export const STATUS_TEXT: Record<AvailabilityStatus, string> = {
  available: "text-success",
  maybe: "text-warning",
  unavailable: "text-danger",
};

const KIND_ICON: Record<EventKind, ReactNode> = {
  rehearsal: <Guitar />,
  gig: <Mic2 />,
  meeting: <Users2 />,
  other: <CalendarClock />,
};

/** Gigs carry the signal colour – they are the "live" events. Rehearsals stay ink. */
export const KIND_STYLE: Record<EventKind, string> = {
  rehearsal: "bg-fg/[0.06] text-fg",
  gig: "bg-accent-soft text-accent-text",
  meeting: "bg-info-soft text-info",
  other: "bg-fg/[0.04] text-muted",
};

export function EventKindIcon({ kind, className }: { kind: EventKind; className?: string }) {
  return (
    <span className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-full [&_svg]:size-4", KIND_STYLE[kind], className)} title={EVENT_KIND_LABEL[kind]}>
      {KIND_ICON[kind]}
    </span>
  );
}

export function SourceHint({ source }: { source: AvailabilitySource }) {
  if (source === "calendar") return <span className="text-xs text-muted">{t("aus deinem Kalender")}</span>;
  if (source === "day") return <span className="text-xs text-muted">{t("Tagesverfügbarkeit")}</span>;
  return null;
}

/** Three-state RSVP toggle (Kann / Vielleicht / Kann nicht). Clicking the active state clears it. */
export function RsvpButtons({
  value,
  onChange,
  size = "md",
  disabled,
}: {
  value: AvailabilityStatus | null;
  onChange: (status: AvailabilityStatus | null) => void;
  size?: "sm" | "md";
  disabled?: boolean;
}) {
  const options: Array<{ status: AvailabilityStatus; icon: ReactNode; active: string }> = [
    { status: "available", icon: <Check />, active: "bg-success text-white border-success dark:text-[#04140b]" },
    { status: "maybe", icon: <CircleHelp />, active: "bg-warning-fill text-[#1d1402] border-warning-fill" },
    { status: "unavailable", icon: <X />, active: "bg-danger text-white border-danger dark:text-[#1d0408]" },
  ];
  return (
    <div className="inline-flex gap-1.5" role="group" aria-label={t("Verfügbarkeit")}>
      {options.map((option) => {
        const active = value === option.status;
        return (
          <button
            key={option.status}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onChange(active ? null : option.status)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full border font-medium transition-[background-color,border-color,color,transform] duration-200 active:scale-95 disabled:opacity-50 [&_svg]:size-3.5",
              size === "sm" ? "h-8 px-3 text-xs" : "h-9 px-3.5 text-[13px]",
              active ? cn(option.active, "[animation:pop-in_260ms_var(--ease-spring)]") : "border-border bg-surface text-muted hover:border-border-strong hover:text-fg",
            )}
          >
            {option.icon}
            <span className={cn(size === "sm" && "hidden sm:inline")}>{AVAILABILITY_LABEL[option.status]}</span>
          </button>
        );
      })}
    </div>
  );
}

export function AttendanceBar({ summary, className }: { summary: AvailabilitySummary; className?: string }) {
  if (!summary.total) return null;
  const pct = (value: number) => `${(value / summary.total) * 100}%`;
  return (
    <div className={cn("flex h-1 w-full gap-px overflow-hidden rounded-full bg-fg/[0.08]", className)} aria-hidden>
      <span className="bg-success" style={{ width: pct(summary.available) }} />
      <span className="bg-warning" style={{ width: pct(summary.maybe) }} />
      <span className="bg-danger" style={{ width: pct(summary.unavailable) }} />
    </div>
  );
}

export function AttendanceText({ summary }: { summary: AvailabilitySummary }) {
  return (
    <span className="text-xs text-muted">
      <span className="font-medium text-success">{summary.available}</span> {t("zugesagt")}
      {summary.maybe ? <> · <span className="font-medium text-warning">{summary.maybe}</span> {t("vielleicht")}</> : null}
      {summary.unavailable ? <> · <span className="font-medium text-danger">{summary.unavailable}</span> {t("abgesagt")}</> : null}
      {summary.unknown ? <> · {summary.unknown} {t("offen")}</> : null}
    </span>
  );
}
