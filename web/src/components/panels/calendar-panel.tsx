import { useMemo, useState } from "react";

type BandEvent = {
  id: string;
  title: string;
  startsAt: string;
  venueLabel?: string | null;
  myAvailability?: {
    status: "available" | "maybe" | "unavailable";
    note?: string | null;
  } | null;
  availabilitySummary?: {
    availableCount: number;
    maybeCount: number;
    unavailableCount: number;
    missingResponses: number;
    memberCount?: number;
    hasConflict: boolean;
    suggestedStartsAt?: string[];
  };
};

export function CalendarPanel(props: {
  events: BandEvent[];
  dayAvailabilities: Record<string, { myStatus: "available" | "maybe" | "unavailable" | null; summary: { availableCount: number; maybeCount: number; unavailableCount: number; missingResponses: number } }>;
  currentMonth: string;
  newEventTitle: string;
  newEventStartsAt: string;
  newEventRecurrenceEveryDays: string;
  newEventRecurrenceCount: string;
  onChangeEventTitle: (value: string) => void;
  onChangeEventStartsAt: (value: string) => void;
  onChangeRecurrenceEveryDays: (value: string) => void;
  onChangeRecurrenceCount: (value: string) => void;
  onCreateEvent: () => void;
  onUpdateAvailability: (eventId: string, status: "available" | "maybe" | "unavailable") => void;
  onSetDayAvailability: (date: string, status: "available" | "maybe" | "unavailable") => void;
  onMonthChange: (month: string) => void;
}) {
  const {
    events,
    dayAvailabilities,
    currentMonth,
    newEventTitle,
    newEventStartsAt,
    newEventRecurrenceEveryDays,
    newEventRecurrenceCount,
    onChangeEventTitle,
    onChangeEventStartsAt,
    onChangeRecurrenceEveryDays,
    onChangeRecurrenceCount,
    onCreateEvent,
    onUpdateAvailability,
    onSetDayAvailability,
    onMonthChange,
  } = props;

  const [selectedDate, setSelectedDate] = useState<string>("");
  const monthLabel = useMemo(() => {
    const [year, month] = currentMonth.split("-").map(Number);
    return new Date(year, (month ?? 1) - 1, 1).toLocaleDateString("de-DE", { month: "long", year: "numeric" });
  }, [currentMonth]);

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const statusByDate = useMemo(() => {
    const map = new Map<string, "available" | "maybe" | "unavailable" | null>();
    for (const [date, availability] of Object.entries(dayAvailabilities)) {
      map.set(date, availability.myStatus);
    }
    for (const event of events) {
      const date = event.startsAt.slice(0, 10);
      if (map.get(date)) {
        continue;
      }
      const current = map.get(date);
      const mine = event.myAvailability?.status ?? null;
      if (mine === "unavailable") {
        map.set(date, "unavailable");
      } else if (mine === "maybe" && current !== "unavailable") {
        map.set(date, "maybe");
      } else if (mine === "available" && current == null) {
        map.set(date, "available");
      }
    }
    return map;
  }, [dayAvailabilities, events]);

  const explicitEventDays = useMemo(() => {
    const daysWithEvents = new Set<string>();
    for (const event of events) {
      daysWithEvents.add(event.startsAt.slice(0, 10));
    }
    return daysWithEvents;
  }, [events]);

  const conflictByDate = useMemo(() => {
    const map = new Map<string, "warning" | "critical">();
    for (const event of events) {
      const summary = event.availabilitySummary;
      if (!summary) {
        continue;
      }
      const day = event.startsAt.slice(0, 10);
      const critical = summary.hasConflict
        || summary.availableCount < 2
        || summary.unavailableCount >= summary.availableCount
        || summary.missingResponses > summary.availableCount;
      const warning = !critical && (summary.maybeCount >= summary.availableCount || summary.missingResponses >= 2);
      if (critical) {
        map.set(day, "critical");
      } else if (warning && map.get(day) !== "critical") {
        map.set(day, "warning");
      }
    }
    return map;
  }, [events]);

  const dateSummary = useMemo(() => {
    const map = new Map<string, { total: number; available: number; maybe: number; unavailable: number }>();
    for (const event of events) {
      const day = event.startsAt.slice(0, 10);
      const existing = map.get(day) ?? { total: 0, available: 0, maybe: 0, unavailable: 0 };
      existing.total += 1;
      existing.available += event.availabilitySummary?.availableCount ?? 0;
      existing.maybe += event.availabilitySummary?.maybeCount ?? 0;
      existing.unavailable += event.availabilitySummary?.unavailableCount ?? 0;
      map.set(day, existing);
    }
    for (const [day, data] of Object.entries(dayAvailabilities)) {
      const existing = map.get(day) ?? { total: 0, available: 0, maybe: 0, unavailable: 0 };
      existing.available += data.summary.availableCount;
      existing.maybe += data.summary.maybeCount;
      existing.unavailable += data.summary.unavailableCount;
      map.set(day, existing);
    }
    return map;
  }, [dayAvailabilities, events]);

  const days = useMemo(() => {
    const [year, month] = currentMonth.split("-").map(Number);
    const monthStart = new Date(year, (month ?? 1) - 1, 1);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(monthStart);
      date.setDate(1 - monthStart.getDay() + index);
      const iso = date.toISOString().slice(0, 10);
      return {
        iso,
        day: date.getDate(),
        inCurrentMonth: date.getMonth() === monthStart.getMonth(),
        summary: dateSummary.get(iso) ?? { total: 0, available: 0, maybe: 0, unavailable: 0 },
        myStatus: statusByDate.get(iso) ?? null,
        hasExplicitEvent: explicitEventDays.has(iso),
        conflictTone: conflictByDate.get(iso),
      };
    });
  }, [conflictByDate, currentMonth, dateSummary, explicitEventDays, statusByDate]);

  const selectedDateEvents = useMemo(() => {
    if (!selectedDate) {
      return [];
    }
    return events.filter((event) => event.startsAt.slice(0, 10) === selectedDate);
  }, [events, selectedDate]);

  return (
    <section className="box">
      <h3>Kalender & Verfuegbarkeiten</h3>
      <div className="calendar-month-nav">
        <button
          type="button"
          className="ghost"
          onClick={() => {
            const [year, month] = currentMonth.split("-").map(Number);
            const date = new Date(year, (month ?? 1) - 2, 1);
            onMonthChange(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
          }}
        >
          Vorheriger Monat
        </button>
        <strong>{monthLabel}</strong>
        <input
          type="month"
          value={currentMonth}
          onChange={(event) => onMonthChange(event.target.value)}
          aria-label="Monat auswaehlen"
        />
        <button
          type="button"
          className="ghost"
          onClick={() => {
            const todayMonth = new Date().toISOString().slice(0, 7);
            onMonthChange(todayMonth);
            setSelectedDate(todayIso);
          }}
        >
          Heute
        </button>
        <button
          type="button"
          className="ghost"
          onClick={() => {
            const [year, month] = currentMonth.split("-").map(Number);
            const date = new Date(year, month ?? 1, 1);
            onMonthChange(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
          }}
        >
          Naechster Monat
        </button>
      </div>
      <div className="calendar-legend" aria-label="Kalender Legende">
        <span className="legend-item"><i className="legend-dot available" /> Frei</span>
        <span className="legend-item"><i className="legend-dot maybe" /> Vielleicht</span>
        <span className="legend-item"><i className="legend-dot unavailable" /> Nicht frei</span>
        <span className="legend-item"><i className="legend-dot conflict" /> Konflikt-Risiko</span>
        <span className="legend-item"><i className="legend-outline" /> Expliziter Termin</span>
      </div>
      <div className="availability-calendar-grid">
        {days.map((day) => (
          <button
            key={day.iso}
            type="button"
            className={`availability-day ${day.inCurrentMonth ? "" : "is-out"} ${selectedDate === day.iso ? "is-selected" : ""} ${day.hasExplicitEvent ? "has-explicit-event" : ""} ${day.myStatus ? `tone-${day.myStatus}` : ""} ${day.conflictTone ? `tone-conflict-${day.conflictTone}` : ""}`.trim()}
            onClick={() => setSelectedDate(day.iso)}
          >
            <strong>{day.day}</strong>
            <small>Termine: {day.summary.total}</small>
            <small>{day.summary.available} frei / {day.summary.maybe} maybe / {day.summary.unavailable} nicht frei</small>
          </button>
        ))}
      </div>

      {selectedDate ? (
        <div className="availability-day-panel">
          <h4>Verfuegbarkeit am {new Date(`${selectedDate}T00:00:00`).toLocaleDateString("de-DE")}</h4>
          <div className="availability-chip-row" style={{ marginBottom: "0.5rem" }}>
            <button
              type="button"
              className={dayAvailabilities[selectedDate]?.myStatus === "available" ? "status-chip available active" : "status-chip available"}
              onClick={() => onSetDayAvailability(selectedDate, "available")}
            >
              Ganzer Tag: Kann
            </button>
            <button
              type="button"
              className={dayAvailabilities[selectedDate]?.myStatus === "maybe" ? "status-chip maybe active" : "status-chip maybe"}
              onClick={() => onSetDayAvailability(selectedDate, "maybe")}
            >
              Ganzer Tag: Vielleicht
            </button>
            <button
              type="button"
              className={dayAvailabilities[selectedDate]?.myStatus === "unavailable" ? "status-chip unavailable active" : "status-chip unavailable"}
              onClick={() => onSetDayAvailability(selectedDate, "unavailable")}
            >
              Ganzer Tag: Kann nicht
            </button>
          </div>
          {selectedDateEvents.length === 0 ? <p>Keine Termine an diesem Tag.</p> : null}
          {selectedDateEvents.map((event) => (
            <div key={event.id} className="calendar-day-event">
              <strong>{event.title}</strong>
              <span>{new Date(event.startsAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</span>
              {event.availabilitySummary?.hasConflict ? <span className="status-chip unavailable">Konflikt erkannt</span> : null}
              <div className="availability-chip-row">
                <button type="button" className={event.myAvailability?.status === "available" ? "status-chip available active" : "status-chip available"} onClick={() => onUpdateAvailability(event.id, "available")}>Kann</button>
                <button type="button" className={event.myAvailability?.status === "maybe" ? "status-chip maybe active" : "status-chip maybe"} onClick={() => onUpdateAvailability(event.id, "maybe")}>Vielleicht</button>
                <button type="button" className={event.myAvailability?.status === "unavailable" ? "status-chip unavailable active" : "status-chip unavailable"} onClick={() => onUpdateAvailability(event.id, "unavailable")}>Kann nicht</button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="thread-form" style={{ marginBottom: "0.6rem" }}>
        <input
          placeholder="Neuer Termin"
          value={newEventTitle}
          onChange={(event) => onChangeEventTitle(event.target.value)}
        />
        <input
          type="datetime-local"
          value={newEventStartsAt}
          onChange={(event) => onChangeEventStartsAt(event.target.value)}
        />
        <input
          type="number"
          min={1}
          placeholder="Intervall Tage"
          value={newEventRecurrenceEveryDays}
          onChange={(event) => onChangeRecurrenceEveryDays(event.target.value)}
        />
        <input
          type="number"
          min={1}
          placeholder="Anzahl Termine"
          value={newEventRecurrenceCount}
          onChange={(event) => onChangeRecurrenceCount(event.target.value)}
        />
        <button type="button" onClick={onCreateEvent}>
          Termin/Serie erstellen
        </button>
      </div>
      <ul className="calendar-list">
        {events.map((event) => (
          <li key={event.id}>
            <strong>{event.title}</strong>
            <span>{new Date(event.startsAt).toLocaleString("de-DE")}</span>
            <span>{event.venueLabel ?? "Ort folgt"}</span>
            <span>
              Zusagen: {event.availabilitySummary?.availableCount ?? 0} | Vielleicht: {event.availabilitySummary?.maybeCount ?? 0} |
              Absagen: {event.availabilitySummary?.unavailableCount ?? 0} | Offen: {event.availabilitySummary?.missingResponses ?? 0}
            </span>
            <span>{event.availabilitySummary?.hasConflict ? "Konflikt erkannt" : "Kein Konflikt"}</span>
            {event.availabilitySummary?.hasConflict && (event.availabilitySummary?.suggestedStartsAt?.length ?? 0) > 0 ? (
              <span>
                Vorschlaege: {event.availabilitySummary?.suggestedStartsAt?.map((iso) => new Date(iso).toLocaleDateString("de-DE")).join(" | ")}
              </span>
            ) : null}
            <div>
              <label>
                Meine Verfuegbarkeit
                <select
                  value={event.myAvailability?.status ?? "maybe"}
                  onChange={(e) => onUpdateAvailability(event.id, e.target.value as "available" | "maybe" | "unavailable")}
                >
                  <option value="available">Verfuegbar</option>
                  <option value="maybe">Vielleicht</option>
                  <option value="unavailable">Nicht verfuegbar</option>
                </select>
              </label>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
