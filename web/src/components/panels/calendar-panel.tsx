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
    hasConflict: boolean;
    suggestedStartsAt?: string[];
  };
};

export function CalendarPanel(props: {
  events: BandEvent[];
  canCreateEvents: boolean;
  canUpdateAvailability: boolean;
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
}) {
  const {
    events,
    canCreateEvents,
    canUpdateAvailability,
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
  } = props;

  return (
    <section className="box">
      <h3>Kalender (offline-faehig)</h3>
      {!canUpdateAvailability ? (
        <p style={{ color: "var(--muted)" }}>
          Verfuegbarkeiten sind fuer deine Rolle nur lesbar.
        </p>
      ) : null}
      <div className="thread-form" style={{ marginBottom: "0.6rem" }}>
        <input
          placeholder="Neuer Termin"
          value={newEventTitle}
          onChange={(event) => onChangeEventTitle(event.target.value)}
          disabled={!canCreateEvents}
        />
        <input
          type="datetime-local"
          value={newEventStartsAt}
          onChange={(event) => onChangeEventStartsAt(event.target.value)}
          disabled={!canCreateEvents}
        />
        <input
          type="number"
          min={1}
          placeholder="Intervall Tage"
          value={newEventRecurrenceEveryDays}
          onChange={(event) => onChangeRecurrenceEveryDays(event.target.value)}
          disabled={!canCreateEvents}
        />
        <input
          type="number"
          min={1}
          placeholder="Anzahl Termine"
          value={newEventRecurrenceCount}
          onChange={(event) => onChangeRecurrenceCount(event.target.value)}
          disabled={!canCreateEvents}
        />
        <button type="button" onClick={onCreateEvent} disabled={!canCreateEvents}>
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
                  disabled={!canUpdateAvailability}
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
