/**
 * Bandival notation model – a compact, instrument-aware score format (one staff per score).
 * Pitches are stored as *written* pitch (guitar & bass sound an octave lower, like in MuseScore).
 */

export type Step = "C" | "D" | "E" | "F" | "G" | "A" | "B";
export type Pitch = { step: Step; alter: number; octave: number };
export type BaseDuration = 1 | 2 | 4 | 8 | 16 | 32;

export type DrumSound =
  | "kick" | "snare" | "rimshot" | "hihat" | "hihat-open" | "hihat-pedal"
  | "ride" | "crash" | "tom-high" | "tom-mid" | "tom-floor";

export type ScoreEvent = {
  id: string;
  /** Pitched notes (empty = rest unless drums are set). */
  pitches: Pitch[];
  drums?: DrumSound[];
  duration: BaseDuration;
  dots: 0 | 1 | 2;
  triplet?: boolean;
  /** Tie to the following event. */
  tie?: boolean;
  chord?: string;
  lyric?: string;
  accent?: boolean;
  staccato?: boolean;
};

export type InstrumentId = "voice" | "guitar" | "bass" | "piano" | "drums" | "violin" | "trumpet" | "sax" | "flute";
export type Clef = "treble" | "bass" | "perc";

export type ScoreDoc = {
  version: 1;
  instrument: InstrumentId;
  clef: Clef;
  /** Show tablature below the staff (guitar & bass). */
  tab: boolean;
  key: string;
  meter: string;
  tempo: number;
  events: ScoreEvent[];
};

export const STEPS: Step[] = ["C", "D", "E", "F", "G", "A", "B"];
const STEP_SEMITONES: Record<Step, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export type InstrumentInfo = {
  label: string;
  clef: Clef;
  tab: boolean;
  /** Semitones from written to sounding pitch. */
  soundingOffset: number;
  gmProgram: number;
  tuning?: string[];
  defaultOctave: number;
  synth: "pluck" | "bass" | "keys" | "lead" | "voice" | "drums";
};

export const INSTRUMENTS: Record<InstrumentId, InstrumentInfo> = {
  voice: { label: "Gesang", clef: "treble", tab: false, soundingOffset: 0, gmProgram: 53, defaultOctave: 4, synth: "voice" },
  guitar: { label: "Gitarre", clef: "treble", tab: true, soundingOffset: -12, gmProgram: 25, tuning: ["E,", "A,", "D", "G", "B", "e"], defaultOctave: 4, synth: "pluck" },
  bass: { label: "Bass", clef: "bass", tab: true, soundingOffset: -12, gmProgram: 33, tuning: ["E,,", "A,,", "D,", "G,"], defaultOctave: 2, synth: "bass" },
  piano: { label: "Piano / Keys", clef: "treble", tab: false, soundingOffset: 0, gmProgram: 0, defaultOctave: 4, synth: "keys" },
  drums: { label: "Drums", clef: "perc", tab: false, soundingOffset: 0, gmProgram: 0, defaultOctave: 4, synth: "drums" },
  violin: { label: "Violine", clef: "treble", tab: false, soundingOffset: 0, gmProgram: 40, defaultOctave: 4, synth: "lead" },
  trumpet: { label: "Trompete (in C)", clef: "treble", tab: false, soundingOffset: 0, gmProgram: 56, defaultOctave: 4, synth: "lead" },
  sax: { label: "Saxophon (in C)", clef: "treble", tab: false, soundingOffset: 0, gmProgram: 65, defaultOctave: 4, synth: "lead" },
  flute: { label: "Flöte", clef: "treble", tab: false, soundingOffset: 0, gmProgram: 73, defaultOctave: 5, synth: "lead" },
};

export type DrumInfo = { label: string; key: string; display: Pitch; cymbal: boolean; midi: number };

/** Standard drum-set notation (Weinberg) positions on a percussion staff. */
export const DRUMS: Record<DrumSound, DrumInfo> = {
  kick: { label: "Bassdrum", key: "k", display: { step: "F", alter: 0, octave: 4 }, cymbal: false, midi: 36 },
  snare: { label: "Snare", key: "s", display: { step: "C", alter: 0, octave: 5 }, cymbal: false, midi: 38 },
  rimshot: { label: "Rimshot", key: "x", display: { step: "C", alter: 0, octave: 5 }, cymbal: true, midi: 37 },
  hihat: { label: "Hi-Hat", key: "h", display: { step: "G", alter: 0, octave: 5 }, cymbal: true, midi: 42 },
  "hihat-open": { label: "Hi-Hat offen", key: "o", display: { step: "G", alter: 0, octave: 5 }, cymbal: true, midi: 46 },
  "hihat-pedal": { label: "Hi-Hat Pedal", key: "p", display: { step: "D", alter: 0, octave: 4 }, cymbal: true, midi: 44 },
  ride: { label: "Ride", key: "r", display: { step: "F", alter: 0, octave: 5 }, cymbal: true, midi: 51 },
  crash: { label: "Crash", key: "c", display: { step: "A", alter: 0, octave: 5 }, cymbal: true, midi: 49 },
  "tom-high": { label: "Tom 1", key: "t", display: { step: "E", alter: 0, octave: 5 }, cymbal: false, midi: 50 },
  "tom-mid": { label: "Tom 2", key: "m", display: { step: "D", alter: 0, octave: 5 }, cymbal: false, midi: 47 },
  "tom-floor": { label: "Floor Tom", key: "f", display: { step: "A", alter: 0, octave: 4 }, cymbal: false, midi: 43 },
};

export const DRUM_ORDER: DrumSound[] = ["crash", "ride", "hihat", "hihat-open", "tom-high", "tom-mid", "snare", "rimshot", "tom-floor", "kick", "hihat-pedal"];

/* ---------- Durations ---------- */

/** Ticks per whole note (quarter = 480). */
export const WHOLE = 1920;
export const DURATION_LABEL: Record<BaseDuration, string> = { 1: "Ganze", 2: "Halbe", 4: "Viertel", 8: "Achtel", 16: "Sechzehntel", 32: "32tel" };

export function eventTicks(event: Pick<ScoreEvent, "duration" | "dots" | "triplet">): number {
  const base = WHOLE / event.duration;
  const dotted = event.dots === 2 ? base * 1.75 : event.dots === 1 ? base * 1.5 : base;
  return event.triplet ? Math.round((dotted * 2) / 3) : dotted;
}

export function parseMeter(meter: string): { beats: number; beatType: number; measureTicks: number; beatTicks: number } {
  const match = /^(\d{1,2})\/(1|2|4|8|16)$/.exec(meter.trim());
  const beats = match ? Number(match[1]) : 4;
  const beatType = match ? Number(match[2]) : 4;
  const measureTicks = (WHOLE / beatType) * beats;
  // Compound meters (6/8, 9/8, 12/8) are felt in dotted quarters.
  const compound = beatType === 8 && beats % 3 === 0 && beats > 3;
  const beatTicks = compound ? (WHOLE / 8) * 3 : WHOLE / beatType;
  return { beats, beatType, measureTicks, beatTicks };
}

type Representable = { duration: BaseDuration; dots: 0 | 1 | 2; ticks: number };
const REPRESENTABLE: Representable[] = ([1, 2, 4, 8, 16, 32] as BaseDuration[]).flatMap((duration) => {
  const base = WHOLE / duration;
  return [
    { duration, dots: 1 as const, ticks: base * 1.5 },
    { duration, dots: 0 as const, ticks: base },
  ];
}).filter((entry) => Number.isInteger(entry.ticks)).sort((a, b) => b.ticks - a.ticks);

/** Splits a tick length into notatable durations (used at barlines). */
export function decomposeTicks(ticks: number): Representable[] {
  const parts: Representable[] = [];
  let rest = ticks;
  while (rest > 0) {
    const fit = REPRESENTABLE.find((entry) => entry.ticks <= rest);
    if (!fit) break;
    parts.push(fit);
    rest -= fit.ticks;
  }
  return parts;
}

/* ---------- Keys & pitches ---------- */

const MAJOR_FIFTHS: Record<string, number> = {
  Cb: -7, Gb: -6, Db: -5, Ab: -4, Eb: -3, Bb: -2, F: -1, C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, "F#": 6, "C#": 7,
};
const MINOR_FIFTHS: Record<string, number> = {
  Abm: -7, Ebm: -6, Bbm: -5, Fm: -4, Cm: -3, Gm: -2, Dm: -1, Am: 0, Em: 1, Bm: 2, "F#m": 3, "C#m": 4, "G#m": 5, "D#m": 6, "A#m": 7,
};
export const KEYS = [...Object.keys(MAJOR_FIFTHS), ...Object.keys(MINOR_FIFTHS)];
export const MAJOR_KEYS = Object.keys(MAJOR_FIFTHS);
export const MINOR_KEYS = Object.keys(MINOR_FIFTHS);

export function keyFifths(key: string): { fifths: number; mode: "major" | "minor" } {
  if (key in MINOR_FIFTHS) return { fifths: MINOR_FIFTHS[key], mode: "minor" };
  return { fifths: MAJOR_FIFTHS[key] ?? 0, mode: "major" };
}

const SHARP_ORDER: Step[] = ["F", "C", "G", "D", "A", "E", "B"];
const FLAT_ORDER: Step[] = ["B", "E", "A", "D", "G", "C", "F"];

/** Alteration of each step implied by the key signature. */
export function keyAlterations(key: string): Record<Step, number> {
  const { fifths } = keyFifths(key);
  const result: Record<Step, number> = { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0 };
  if (fifths > 0) SHARP_ORDER.slice(0, fifths).forEach((step) => (result[step] = 1));
  if (fifths < 0) FLAT_ORDER.slice(0, -fifths).forEach((step) => (result[step] = -1));
  return result;
}

/** Normalises a song key like "A-Moll", "f#", "Bb major" to a notation key. */
export function normalizeKey(value: string | null | undefined): string {
  if (!value) return "C";
  const match = /^\s*([A-Ga-g])\s*(#|b|♯|♭|is|es)?\s*(m|min|moll|minor|-?moll)?/i.exec(value);
  if (!match) return "C";
  const root = match[1].toUpperCase();
  const accidental = match[2] === "#" || match[2] === "♯" || match[2]?.toLowerCase() === "is" ? "#" : match[2] === "b" || match[2] === "♭" || match[2]?.toLowerCase() === "es" ? "b" : "";
  const minor = Boolean(match[3]) || /moll|minor/i.test(value) || (match[1] === match[1].toLowerCase() && !match[2]);
  const candidate = `${root}${accidental}${minor ? "m" : ""}`;
  return KEYS.includes(candidate) ? candidate : minor ? "Am" : "C";
}

export function midiNumber(pitch: Pitch): number {
  return (pitch.octave + 1) * 12 + STEP_SEMITONES[pitch.step] + pitch.alter;
}

const SHARP_SPELLING: Array<[Step, number]> = [["C", 0], ["C", 1], ["D", 0], ["D", 1], ["E", 0], ["F", 0], ["F", 1], ["G", 0], ["G", 1], ["A", 0], ["A", 1], ["B", 0]];
const FLAT_SPELLING: Array<[Step, number]> = [["C", 0], ["D", -1], ["D", 0], ["E", -1], ["E", 0], ["F", 0], ["G", -1], ["G", 0], ["A", -1], ["A", 0], ["B", -1], ["B", 0]];

export function pitchFromMidi(midi: number, preferFlats = false): Pitch {
  const octave = Math.floor(midi / 12) - 1;
  const [step, alter] = (preferFlats ? FLAT_SPELLING : SHARP_SPELLING)[((midi % 12) + 12) % 12];
  return { step, alter, octave };
}

export function transposePitch(pitch: Pitch, semitones: number, preferFlats?: boolean): Pitch {
  return pitchFromMidi(midiNumber(pitch) + semitones, preferFlats ?? semitones < 0);
}

/** Picks the octave for a newly typed step so that it is closest to the previous note (MuseScore behaviour). */
export function nearestPitch(step: Step, alter: number, reference: Pitch | null, defaultOctave: number): Pitch {
  if (!reference) return { step, alter, octave: defaultOctave };
  const refMidi = midiNumber(reference);
  let best: Pitch = { step, alter, octave: reference.octave };
  for (const octave of [reference.octave - 1, reference.octave, reference.octave + 1]) {
    const candidate = { step, alter, octave };
    if (Math.abs(midiNumber(candidate) - refMidi) < Math.abs(midiNumber(best) - refMidi)) best = candidate;
  }
  return best;
}

export function pitchLabel(pitch: Pitch): string {
  const accidental = pitch.alter === 1 ? "♯" : pitch.alter === 2 ? "𝄪" : pitch.alter === -1 ? "♭" : pitch.alter === -2 ? "𝄫" : "";
  return `${pitch.step}${accidental}${pitch.octave}`;
}

/* ---------- Documents ---------- */

export function newEventId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
}

export function emptyScore(instrument: InstrumentId = "piano", options: Partial<Pick<ScoreDoc, "key" | "meter" | "tempo">> = {}): ScoreDoc {
  const info = INSTRUMENTS[instrument];
  return {
    version: 1,
    instrument,
    clef: info.clef,
    tab: info.tab,
    key: instrument === "drums" ? "C" : options.key ?? "C",
    meter: options.meter ?? "4/4",
    tempo: options.tempo ?? 100,
    events: [],
  };
}

const BASE_DURATIONS = new Set([1, 2, 4, 8, 16, 32]);

/** Validates and cleans untrusted score JSON (from the API or imports). */
export function sanitizeScore(input: unknown): ScoreDoc {
  const raw = (input && typeof input === "object" ? input : {}) as Partial<ScoreDoc>;
  const instrument = (raw.instrument && raw.instrument in INSTRUMENTS ? raw.instrument : "piano") as InstrumentId;
  const clef: Clef = raw.clef === "bass" || raw.clef === "perc" || raw.clef === "treble" ? raw.clef : INSTRUMENTS[instrument].clef;
  const events = Array.isArray(raw.events) ? raw.events.slice(0, 4000) : [];
  return {
    version: 1,
    instrument,
    clef,
    tab: Boolean(raw.tab) && (instrument === "guitar" || instrument === "bass"),
    key: typeof raw.key === "string" && KEYS.includes(raw.key) ? raw.key : "C",
    meter: typeof raw.meter === "string" && /^(\d{1,2})\/(1|2|4|8|16)$/.test(raw.meter) ? raw.meter : "4/4",
    tempo: Math.min(400, Math.max(20, Number(raw.tempo) || 100)),
    events: events.map((entry) => {
      const event = (entry ?? {}) as Partial<ScoreEvent>;
      const pitches = Array.isArray(event.pitches) ? event.pitches : [];
      return {
        id: typeof event.id === "string" ? event.id.slice(0, 20) : newEventId(),
        pitches: pitches
          .filter((pitch): pitch is Pitch => Boolean(pitch) && STEPS.includes(pitch.step) && Number.isInteger(pitch.octave))
          .slice(0, 10)
          .map((pitch) => ({ step: pitch.step, alter: Math.max(-2, Math.min(2, Math.trunc(pitch.alter) || 0)), octave: Math.max(0, Math.min(9, pitch.octave)) })),
        drums: Array.isArray(event.drums) ? event.drums.filter((drum): drum is DrumSound => typeof drum === "string" && drum in DRUMS).slice(0, 6) : undefined,
        duration: (BASE_DURATIONS.has(Number(event.duration)) ? Number(event.duration) : 4) as BaseDuration,
        dots: (event.dots === 1 || event.dots === 2 ? event.dots : 0) as 0 | 1 | 2,
        triplet: Boolean(event.triplet) || undefined,
        tie: Boolean(event.tie) || undefined,
        chord: typeof event.chord === "string" && event.chord.trim() ? event.chord.trim().slice(0, 24) : undefined,
        lyric: typeof event.lyric === "string" && event.lyric.trim() ? event.lyric.trim().slice(0, 40) : undefined,
        accent: Boolean(event.accent) || undefined,
        staccato: Boolean(event.staccato) || undefined,
      };
    }),
  };
}

export function isRest(event: ScoreEvent): boolean {
  return event.pitches.length === 0 && !(event.drums && event.drums.length > 0);
}

/* ---------- Measure layout ---------- */

export type Piece = {
  eventIndex: number;
  ticks: number;
  duration: BaseDuration;
  dots: 0 | 1 | 2;
  triplet: boolean;
  /** Piece continues the previous piece of the same event (tied across a barline). */
  continuation: boolean;
  /** Draw a tie to the next piece (barline split or the event's own tie). */
  tieNext: boolean;
  startTick: number;
};

export type Measure = { pieces: Piece[]; startTick: number };

/** Distributes events into measures, splitting (and tying) notes that cross a barline. */
export function layoutMeasures(doc: ScoreDoc): Measure[] {
  const { measureTicks } = parseMeter(doc.meter);
  const measures: Measure[] = [{ pieces: [], startTick: 0 }];
  let position = 0;
  let filled = 0;

  const push = (piece: Omit<Piece, "startTick">) => {
    if (filled >= measureTicks) {
      measures.push({ pieces: [], startTick: position });
      filled = 0;
    }
    measures[measures.length - 1].pieces.push({ ...piece, startTick: position });
    position += piece.ticks;
    filled += piece.ticks;
  };

  doc.events.forEach((event, eventIndex) => {
    const ticks = eventTicks(event);
    if (filled >= measureTicks) {
      measures.push({ pieces: [], startTick: position });
      filled = 0;
    }
    const room = measureTicks - filled;
    // Triplets are never split (keeps groups intact); fitting notes go in as they are.
    if (ticks <= room || event.triplet) {
      push({ eventIndex, ticks, duration: event.duration, dots: event.dots, triplet: Boolean(event.triplet), continuation: false, tieNext: Boolean(event.tie) });
      return;
    }
    const rest = isRest(event);
    const segments = [...decomposeTicks(room)];
    let remaining = ticks - room;
    while (remaining > 0) {
      const chunk = Math.min(remaining, measureTicks);
      segments.push(...decomposeTicks(chunk));
      remaining -= chunk;
    }
    segments.forEach((segment, segmentIndex) => {
      const last = segmentIndex === segments.length - 1;
      push({
        eventIndex,
        ticks: segment.ticks,
        duration: segment.duration,
        dots: segment.dots,
        triplet: false,
        continuation: segmentIndex > 0,
        tieNext: rest ? false : last ? Boolean(event.tie) : true,
      });
    });
  });

  if (measures.length > 1 && measures[measures.length - 1].pieces.length === 0) measures.pop();
  return measures;
}

export function totalTicks(doc: ScoreDoc): number {
  return doc.events.reduce((sum, event) => sum + eventTicks(event), 0);
}

/** Flattened note list for playback/MIDI: ties merged, sounding pitch applied. */
export type PlayNote = { eventIndex: number; startTick: number; ticks: number; midi: number[]; drums: DrumSound[]; accent: boolean; staccato: boolean };

export function playbackNotes(doc: ScoreDoc): PlayNote[] {
  const offset = INSTRUMENTS[doc.instrument].soundingOffset;
  const notes: PlayNote[] = [];
  let tick = 0;
  let tiedFrom: PlayNote | null = null;
  doc.events.forEach((event, eventIndex) => {
    const ticks = eventTicks(event);
    const midi = event.pitches.map((pitch) => midiNumber(pitch) + offset);
    if (tiedFrom && midi.length > 0 && midi.every((value) => tiedFrom!.midi.includes(value))) {
      tiedFrom.ticks += ticks;
    } else if (!isRest(event)) {
      const note: PlayNote = { eventIndex, startTick: tick, ticks, midi, drums: event.drums ?? [], accent: Boolean(event.accent), staccato: Boolean(event.staccato) };
      notes.push(note);
      tiedFrom = event.tie && midi.length > 0 ? note : null;
      tick += ticks;
      return;
    }
    tiedFrom = tiedFrom && event.tie ? tiedFrom : null;
    tick += ticks;
  });
  return notes;
}

/** Transposes all pitched notes (and chord symbols) by a number of semitones. */
export function transposeScore(doc: ScoreDoc, semitones: number, transposeChord: (chord: string, semitones: number) => string): ScoreDoc {
  if (semitones === 0 || doc.instrument === "drums") return doc;
  const keys = keyFifths(doc.key).mode === "minor" ? MINOR_KEYS : MAJOR_KEYS;
  const { fifths } = keyFifths(doc.key);
  // Move the key by the same interval (7 fifths per semitone mod 12), keep it readable (≤ 6 accidentals).
  let nextFifths = ((fifths + semitones * 7) % 12 + 12) % 12;
  if (nextFifths > 6) nextFifths -= 12;
  const nextKey = keys.find((key) => keyFifths(key).fifths === nextFifths) ?? doc.key;
  const preferFlats = nextFifths < 0;
  return {
    ...doc,
    key: nextKey,
    events: doc.events.map((event) => ({
      ...event,
      pitches: event.pitches.map((pitch) => transposePitch(pitch, semitones, preferFlats)),
      chord: event.chord ? transposeChord(event.chord, semitones) : undefined,
    })),
  };
}
