import { type MouseEvent, useEffect, useMemo, useState } from "react";

function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

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
  onCreateEvent: (payload?: {
    title: string;
    startsAt: string;
    recurrenceEveryDays: number | null;
    recurrenceCount: number | null;
  }) => void;
  onUpdateAvailability: (eventId: string, status: "available" | "maybe" | "unavailable") => void;
  onSetDayAvailability: (date: string, status: "available" | "maybe" | "unavailable") => void;
  onSetDayAvailabilityBulk: (dates: string[], status: "available" | "maybe" | "unavailable") => void;
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
    onSetDayAvailabilityBulk,
    onMonthChange,
  } = props;

  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [anchorDate, setAnchorDate] = useState<string>("");
  const [isCreateEventOpen, setIsCreateEventOpen] = useState(false);
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("20:00");
  const [recurrenceMode, setRecurrenceMode] = useState<"none" | "daily" | "weekly" | "custom">("none");
  const monthLabel = useMemo(() => {
    const [year, month] = currentMonth.split("-").map(Number);
    return new Date(year, (month ?? 1) - 1, 1).toLocaleDateString("de-DE", { month: "long", year: "numeric" });
  }, [currentMonth]);

  const todayIso = useMemo(() => toLocalIsoDate(new Date()), []);

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
      const iso = toLocalIsoDate(date);
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

  const selectedDatesLabel = selectedDates.length > 1
    ? `${selectedDates.length} Tage ausgewaehlt`
    : selectedDate
      ? new Date(`${selectedDate}T00:00:00`).toLocaleDateString("de-DE")
      : "Kein Tag ausgewaehlt";

  const orderedDates = useMemo(() => days.map((day) => day.iso), [days]);

  function pickEventDateFromSelection() {
    const fromSelection = selectedDate || selectedDates[0] || todayIso;
    setEventDate(fromSelection);
  }

  function handleDayClick(dayIso: string, event: MouseEvent<HTMLButtonElement>) {
    if (event.shiftKey && anchorDate) {
      const start = orderedDates.indexOf(anchorDate);
      const end = orderedDates.indexOf(dayIso);
      if (start >= 0 && end >= 0) {
        const [from, to] = start <= end ? [start, end] : [end, start];
        const range = orderedDates.slice(from, to + 1);
        setSelectedDates(range);
      }
    } else if (event.ctrlKey || event.metaKey) {
      setSelectedDates((prev) => (prev.includes(dayIso) ? prev.filter((d) => d !== dayIso) : [...prev, dayIso]));
    } else {
      setSelectedDates([dayIso]);
    }

    setSelectedDate(dayIso);
    setAnchorDate(dayIso);
  }

  function applyDayAvailability(status: "available" | "maybe" | "unavailable") {
    const dates = selectedDates.length > 0 ? selectedDates : (selectedDate ? [selectedDate] : []);
    if (dates.length === 0) {
      return;
    }

    if (dates.length === 1) {
      onSetDayAvailability(dates[0], status);
      return;
    }

    onSetDayAvailabilityBulk(dates, status);
  }

  function submitEventForm() {
    if (!newEventTitle.trim()) {
      return;
    }

    const selected = eventDate || selectedDate || selectedDates[0] || todayIso;
    const startsAt = `${selected}T${eventTime || "20:00"}`;
    onChangeEventStartsAt(startsAt);

    let recurrenceEveryDays: number | null = null;
    let recurrenceCount: number | null = null;
    if (recurrenceMode === "daily") {
      recurrenceEveryDays = 1;
      recurrenceCount = Number(newEventRecurrenceCount) > 1 ? Number(newEventRecurrenceCount) : 10;
    } else if (recurrenceMode === "weekly") {
      recurrenceEveryDays = 7;
      recurrenceCount = Number(newEventRecurrenceCount) > 1 ? Number(newEventRecurrenceCount) : 12;
    } else if (recurrenceMode === "custom") {
      recurrenceEveryDays = Number(newEventRecurrenceEveryDays) > 0 ? Number(newEventRecurrenceEveryDays) : 1;
      recurrenceCount = Number(newEventRecurrenceCount) > 1 ? Number(newEventRecurrenceCount) : 2;
    }

    onCreateEvent({
      title: newEventTitle.trim(),
      startsAt,
      recurrenceEveryDays,
      recurrenceCount,
    });
    setIsCreateEventOpen(false);
  }

  useEffect(() => {
    if (!newEventStartsAt) {
      return;
    }
    const [datePart, timePart] = newEventStartsAt.split("T");
    if (datePart) {
      setEventDate(datePart);
    }
    if (timePart) {
      setEventTime(timePart.slice(0, 5));
    }
  }, [newEventStartsAt]);

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
            const today = new Date();
            const todayMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
            onMonthChange(todayMonth);
            setSelectedDate(todayIso);
            setSelectedDates([todayIso]);
            setAnchorDate(todayIso);
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
      <div className="availability-calendar-grid stagger-in">
        {days.map((day) => (
          <button
            key={day.iso}
            type="button"
            className={`availability-day ${day.inCurrentMonth ? "" : "is-out"} ${selectedDate === day.iso || selectedDates.includes(day.iso) ? "is-selected" : ""} ${day.hasExplicitEvent ? "has-explicit-event" : ""} ${day.myStatus ? `tone-${day.myStatus}` : ""} ${day.conflictTone ? `tone-conflict-${day.conflictTone}` : ""}`.trim()}
            onClick={(event) => handleDayClick(day.iso, event)}
          >
            <strong>{day.day}</strong>
            <small>Termine: {day.summary.total}</small>
            <small>{day.summary.available} frei / {day.summary.maybe} maybe / {day.summary.unavailable} nicht frei</small>
          </button>
        ))}
      </div>

      <p style={{ marginTop: "-0.25rem", color: "var(--muted)" }}>
        Auswahl: {selectedDatesLabel} (Strg/Cmd + Klick fuer Multi-Select, Shift + Klick fuer Bereichsauswahl)
      </p>

      {selectedDate ? (
        <div className="availability-day-panel">
          <h4>Verfuegbarkeit am {new Date(`${selectedDate}T00:00:00`).toLocaleDateString("de-DE")}</h4>
          <div className="availability-chip-row" style={{ marginBottom: "0.5rem" }}>
            <button
              type="button"
              className={dayAvailabilities[selectedDate]?.myStatus === "available" ? "status-chip available active" : "status-chip available"}
              onClick={() => applyDayAvailability("available")}
            >
              {selectedDates.length > 1 ? "Auswahl: Kann" : "Ganzer Tag: Kann"}
            </button>
            <button
              type="button"
              className={dayAvailabilities[selectedDate]?.myStatus === "maybe" ? "status-chip maybe active" : "status-chip maybe"}
              onClick={() => applyDayAvailability("maybe")}
            >
              {selectedDates.length > 1 ? "Auswahl: Vielleicht" : "Ganzer Tag: Vielleicht"}
            </button>
            <button
              type="button"
              className={dayAvailabilities[selectedDate]?.myStatus === "unavailable" ? "status-chip unavailable active" : "status-chip unavailable"}
              onClick={() => applyDayAvailability("unavailable")}
            >
              {selectedDates.length > 1 ? "Auswahl: Kann nicht" : "Ganzer Tag: Kann nicht"}
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

      <div className="quick-actions" style={{ marginBottom: "0.6rem" }}>
        <button type="button" onClick={() => { pickEventDateFromSelection(); setIsCreateEventOpen(true); }}>
          Termin erstellen
        </button>
      </div>

      {isCreateEventOpen ? (
        <div className="create-modal-backdrop" role="dialog" aria-modal="true" aria-label="Termin erstellen">
          <div className="create-modal">
            <h3>Neuer Termin</h3>
            <div className="create-modal-body thread-form">
              <label>
                Titel
                <input
                  placeholder="z.B. Probe Dienstag"
                  value={newEventTitle}
                  onChange={(event) => onChangeEventTitle(event.target.value)}
                />
              </label>
              <div className="inline-tools">
                <label>
                  Datum
                  <input type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} />
                </label>
                <label>
                  Uhrzeit
                  <input type="time" value={eventTime} onChange={(event) => setEventTime(event.target.value)} />
                </label>
              </div>
              <button type="button" className="ghost" onClick={pickEventDateFromSelection}>Datum aus Kalenderausschnitt uebernehmen</button>
              <label>
                Wiederholung
                <select value={recurrenceMode} onChange={(event) => setRecurrenceMode(event.target.value as "none" | "daily" | "weekly" | "custom")}>
                  <option value="none">Keine Wiederholung</option>
                  <option value="daily">Taeglich</option>
                  <option value="weekly">Woechentlich</option>
                  <option value="custom">Benutzerdefiniert</option>
                </select>
              </label>
              {recurrenceMode === "custom" ? (
                <label>
                  Alle X Tage
                  <input
                    type="number"
                    min={1}
                    value={newEventRecurrenceEveryDays}
                    onChange={(event) => onChangeRecurrenceEveryDays(event.target.value)}
                  />
                </label>
              ) : null}
              {recurrenceMode !== "none" ? (
                <label>
                  Anzahl Termine
                  <input
                    type="number"
                    min={2}
                    value={newEventRecurrenceCount}
                    onChange={(event) => onChangeRecurrenceCount(event.target.value)}
                  />
                </label>
              ) : null}
            </div>
            <div className="create-modal-actions">
              <button type="button" className="ghost" onClick={() => setIsCreateEventOpen(false)}>Abbrechen</button>
              <button type="button" onClick={submitEventForm}>Termin speichern</button>
            </div>
          </div>
        </div>
      ) : null}
      <ul className="calendar-list stagger-in">
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
