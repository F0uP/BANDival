import type { DocSpec } from "@/lib/merge/document";

/** Documents that can be edited by several people (and offline) and are merged like git. */
export type DocType = "song" | "part" | "score" | "setlist";

export const DOC_TYPES: DocType[] = ["song", "part", "score", "setlist"];

export const DOC_LABEL: Record<DocType, string> = { song: "Song", part: "Stimme", score: "Noten", setlist: "Setlist" };

const STATUS_LABEL: Record<string, string> = { draft: "Idee", review: "In Arbeit", approved: "Bühnenreif", archived: "Archiviert" };
const VISIBILITY_LABEL: Record<string, string> = { band: "Band", private: "Privat", public: "Öffentlich" };

function seconds(value: unknown): string {
  const total = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(total) || total <= 0) return "(leer)";
  return `${Math.floor(total / 60)}:${String(Math.round(total % 60)).padStart(2, "0")}`;
}

function optional(value: unknown, suffix = ""): string {
  return value === null || value === undefined || value === "" ? "(leer)" : `${value}${suffix}`;
}

const STEPS: Record<number, string> = { [-2]: "bb", [-1]: "b", 0: "", 1: "#", 2: "##" };

function describeEvent(event: Record<string, unknown>, index: number): string {
  const pitches = Array.isArray(event.pitches) ? (event.pitches as Array<{ step?: string; alter?: number; octave?: number }>) : [];
  const drums = Array.isArray(event.drums) ? (event.drums as string[]) : [];
  const what = pitches.length
    ? pitches.map((pitch) => `${pitch.step ?? "?"}${STEPS[pitch.alter ?? 0] ?? ""}${pitch.octave ?? ""}`).join("/")
    : drums.length ? drums.join(" + ") : "Pause";
  return `Note ${index + 1} (${what})`;
}

export const DOC_SPECS: Record<DocType, DocSpec> = {
  song: {
    title: { kind: "scalar", label: "Titel" },
    workflowStatus: { kind: "scalar", label: "Status", format: (value) => STATUS_LABEL[String(value)] ?? optional(value) },
    keySignature: { kind: "scalar", label: "Tonart", format: (value) => optional(value) },
    tempoBpm: { kind: "scalar", label: "Tempo", format: (value) => optional(value, " BPM") },
    durationSeconds: { kind: "scalar", label: "Dauer", format: seconds },
    timeSignature: { kind: "scalar", label: "Taktart", format: (value) => optional(value) },
    isPublic: { kind: "scalar", label: "Auf der Bandseite" },
    spotifyUrl: { kind: "scalar", label: "Spotify-Link", format: (value) => optional(value) },
    visibility: { kind: "scalar", label: "Sichtbarkeit", format: (value) => VISIBILITY_LABEL[String(value)] ?? optional(value) },
    notes: { kind: "text", label: "Notizen" },
    chordProText: { kind: "text", label: "Lead Sheet", sections: true },
    composers: { kind: "scalar", label: "Komponist:innen", format: (value) => optional(value) },
    lyricists: { kind: "scalar", label: "Texter:innen", format: (value) => optional(value) },
    publisher: { kind: "scalar", label: "Verlag", format: (value) => optional(value) },
    gemaWorkNumber: { kind: "scalar", label: "GEMA-Werknummer", format: (value) => optional(value) },
  },
  part: {
    kind: { kind: "scalar", label: "Format" },
    content: { kind: "text", label: "Stimme", sections: true },
  },
  score: {
    title: { kind: "scalar", label: "Titel" },
    instrument: { kind: "scalar", label: "Instrument", format: (value) => optional(value) },
    data: {
      kind: "object",
      label: "Noten",
      fields: {
        events: {
          kind: "list",
          label: "Noten",
          itemLabel: (item, index) => describeEvent(item, index),
          itemFields: {
            pitches: { kind: "scalar", label: "Tonhöhe", format: (value) => JSON.stringify(value) },
            duration: { kind: "scalar", label: "Notenwert" },
            dots: { kind: "scalar", label: "Punktierung" },
            chord: { kind: "scalar", label: "Akkord", format: (value) => optional(value) },
            lyric: { kind: "scalar", label: "Liedtext", format: (value) => optional(value) },
          },
        },
        key: { kind: "scalar", label: "Tonart" },
        meter: { kind: "scalar", label: "Taktart" },
        tempo: { kind: "scalar", label: "Tempo", format: (value) => optional(value, " BPM") },
        clef: { kind: "scalar", label: "Schlüssel" },
        instrument: { kind: "scalar", label: "Instrument" },
        tab: { kind: "scalar", label: "Tabulatur" },
      },
    },
  },
  setlist: {
    name: { kind: "scalar", label: "Name" },
    description: { kind: "text", label: "Beschreibung" },
    instruments: { kind: "set", label: "Instrumente" },
    equipment: { kind: "set", label: "Equipment" },
    items: {
      kind: "list",
      label: "Songs",
      itemLabel: (item, index, labels) => labels[String(item.songId ?? item.id)] ?? `Song ${index + 1}`,
      itemFields: {
        songId: { kind: "scalar", label: "Song" },
        transitionNotes: { kind: "text", label: "Übergang" },
        customKeySignature: { kind: "scalar", label: "Tonart in der Setlist", format: (value) => optional(value) },
        customTempoBpm: { kind: "scalar", label: "Tempo in der Setlist", format: (value) => optional(value, " BPM") },
        customDurationSeconds: { kind: "scalar", label: "Dauer in der Setlist", format: seconds },
      },
    },
  },
};
