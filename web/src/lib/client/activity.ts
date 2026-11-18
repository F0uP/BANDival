import type { AuditEntry } from "@/lib/client/types";

const str = (value: unknown) => (typeof value === "string" && value ? value : null);

/** Turns audit log entries into short, human readable German sentences. */
export function describeActivity(entry: AuditEntry): { text: string; href: string | null } {
  const p = entry.payload ?? {};
  const title = str(p.title) ?? str(p.name);
  const songHref = str(p.songId) ? `/app/songs/${p.songId}` : null;
  const setlistHref = str(p.setlistId) ? `/app/setlists/${p.setlistId}` : null;

  switch (entry.action) {
    case "song_created": return { text: `hat den Song „${title}“ angelegt`, href: songHref };
    case "song_updated": return { text: `hat „${title ?? "einen Song"}“ bearbeitet`, href: songHref };
    case "song_status_changed": return { text: `hat den Status von „${title}“ geändert`, href: songHref };
    case "song_deleted": return { text: `hat den Song „${title}“ gelöscht`, href: null };
    case "audio_uploaded": return { text: `hat eine neue Aufnahme hochgeladen (${str(p.fileName) ?? "Audio"})`, href: songHref };
    case "audio_deleted": return { text: "hat eine Aufnahme gelöscht", href: songHref };
    case "attachment_uploaded": return { text: `hat „${str(p.fileName) ?? "eine Datei"}“ hochgeladen`, href: songHref };
    case "attachment_deleted": return { text: `hat „${str(p.fileName) ?? "eine Datei"}“ gelöscht`, href: songHref };
    case "thread_created": return { text: `hat eine Diskussion gestartet: „${title}“`, href: songHref };
    case "setlist_created": return { text: `hat die Setlist „${title}“ erstellt`, href: setlistHref };
    case "setlist_updated": return { text: `hat die Setlist „${title ?? ""}“ bearbeitet`, href: setlistHref };
    case "setlist_reordered": return { text: `hat die Reihenfolge von „${title ?? "einer Setlist"}“ geändert`, href: setlistHref };
    case "setlist_copied": return { text: `hat eine Setlist kopiert („${title}“)`, href: setlistHref };
    case "setlist_deleted": return { text: `hat die Setlist „${title}“ gelöscht`, href: null };
    case "rehearsal_note_updated": return { text: "hat eine Probennotiz aktualisiert", href: setlistHref };
    case "event_created": return { text: `hat einen Termin angelegt: „${title}“`, href: "/app/calendar" };
    case "event_updated": return { text: `hat den Termin „${title}“ geändert`, href: "/app/calendar" };
    case "event_cancelled": return { text: `hat „${title}“ abgesagt`, href: "/app/calendar" };
    case "event_deleted": return { text: `hat den Termin „${title}“ entfernt`, href: "/app/calendar" };
    case "availability_updated": return { text: `hat für „${title ?? "einen Termin"}“ zu-/abgesagt`, href: "/app/calendar" };
    case "day_availability_updated": return { text: "hat die eigene Verfügbarkeit aktualisiert", href: "/app/calendar" };
    case "task_created": return { text: `hat die Aufgabe „${title}“ erstellt`, href: songHref ?? setlistHref };
    case "task_done": return { text: `hat „${title}“ erledigt`, href: songHref ?? setlistHref };
    case "task_updated": return { text: `hat „${title}“ verschoben`, href: songHref ?? setlistHref };
    case "album_created": return { text: `hat das Album „${title}“ angelegt`, href: null };
    case "album_updated": return { text: `hat das Album „${title}“ bearbeitet`, href: null };
    case "album_deleted": return { text: `hat das Album „${title}“ gelöscht`, href: null };
    case "invite_created": return { text: `hat ${str(p.email) ?? "jemanden"} eingeladen`, href: "/app/band" };
    case "invite_revoked": return { text: "hat eine Einladung widerrufen", href: "/app/band" };
    case "invite_resent": return { text: "hat eine Einladung erneut gesendet", href: "/app/band" };
    case "invite_accepted": return { text: "ist der Band beigetreten 🎉", href: "/app/band" };
    case "member_updated": return { text: `hat ${str(p.targetName) ?? "ein Mitglied"} aktualisiert`, href: "/app/band" };
    case "member_removed": return { text: `hat ${str(p.targetName) ?? "ein Mitglied"} entfernt`, href: "/app/band" };
    case "member_left": return { text: "hat die Band verlassen", href: "/app/band" };
    case "band_created": return { text: `hat die Band „${title}“ gegründet`, href: null };
    case "band_updated": return { text: "hat die Band-Einstellungen geändert", href: "/app/settings" };
    case "backup_restored": return { text: "hat ein Backup wiederhergestellt", href: null };
    case "invite_expiry_updated": return { text: "hat die Gültigkeit einer Einladung geändert", href: "/app/band" };
    case "event_protocol_updated": return { text: `hat das Probenprotokoll${title ? ` zu „${title}“` : ""} aktualisiert`, href: "/app/calendar" };
    case "rehearsal_task_created": return { text: `hat aus der Probe die Aufgabe „${title ?? "…"}“ erstellt`, href: songHref ?? setlistHref };
    case "finance_booked": return { text: "hat eine Buchung in der Bandkasse erfasst", href: "/app/finance" };
    case "invoice_created": return { text: "hat einen Rechnungsentwurf angelegt", href: "/app/finance/invoices" };
    case "invoice_issued": return { text: `hat die Rechnung ${str(p.number) ?? ""} gestellt`, href: "/app/finance/invoices" };
    case "invoice_paid": return { text: `hat die Rechnung ${str(p.number) ?? ""} als bezahlt markiert`, href: "/app/finance/invoices" };
    case "invoice_cancelled": return { text: `hat die Rechnung ${str(p.number) ?? ""} storniert`, href: "/app/finance/invoices" };
    case "idea_created": return { text: `hat eine Idee festgehalten${title ? `: „${title}“` : ""}`, href: "/app/ideas" };
    case "score_created": return { text: `hat Noten zu „${title ?? "einem Song"}“ angelegt`, href: songHref };
    case "score_deleted": return { text: "hat Noten gelöscht", href: songHref };
    case "songs_imported": return { text: "hat Songs importiert", href: "/app/songs" };
    case "stem_uploaded": return { text: "hat eine Einzelspur hochgeladen", href: songHref };
    case "stems_requested": return { text: "hat eine Spurtrennung gestartet", href: songHref };
    case "merge_resolved": return { text: `hat einen Merge-Konflikt${title ? ` in „${title}“` : ""} gelöst`, href: null };
    default: return { text: "hat etwas geändert", href: null };
  }
}

export const ACTIVITY_FILTERS: Array<{ value: string; label: string }> = [
  { value: "all", label: "Alles" },
  { value: "song", label: "Songs" },
  { value: "setlist", label: "Setlists" },
  { value: "event", label: "Termine" },
  { value: "task", label: "Aufgaben" },
  { value: "member", label: "Mitglieder" },
];
