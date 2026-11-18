import {
  INSTRUMENTS,
  keyAlterations,
  keyFifths,
  midiNumber,
  newEventId,
  nearestPitch,
  transposePitch,
  type BaseDuration,
  type DrumSound,
  type Pitch,
  type ScoreDoc,
  type ScoreEvent,
  type Step,
} from "@/lib/notation/model";

/** Pure editing operations – every function returns a new document plus the index to select. */
export type EditResult = { doc: ScoreDoc; selected: number | null };

export type InputState = { duration: BaseDuration; dots: 0 | 1 | 2; triplet: boolean };

function withEvents(doc: ScoreDoc, events: ScoreEvent[]): ScoreDoc {
  return { ...doc, events };
}

function referencePitch(doc: ScoreDoc, index: number | null): Pitch | null {
  for (let cursor = index ?? doc.events.length - 1; cursor >= 0; cursor -= 1) {
    const pitches = doc.events[cursor]?.pitches;
    if (pitches?.length) return pitches[pitches.length - 1];
  }
  return null;
}

function newEvent(input: InputState, patch: Partial<ScoreEvent>): ScoreEvent {
  return { id: newEventId(), pitches: [], duration: input.duration, dots: input.dots, triplet: input.triplet || undefined, ...patch };
}

/** Inserts an event after the selection – or fills the selected rest (MuseScore-like note input). */
function place(doc: ScoreDoc, selected: number | null, input: InputState, patch: Partial<ScoreEvent>): EditResult {
  const events = [...doc.events];
  const current = selected !== null ? events[selected] : null;
  if (current && current.pitches.length === 0 && !(current.drums?.length)) {
    events[selected!] = { ...current, ...patch, duration: input.duration, dots: input.dots, triplet: input.triplet || undefined };
    return { doc: withEvents(doc, events), selected: selected! };
  }
  const at = selected === null ? events.length : selected + 1;
  events.splice(at, 0, newEvent(input, patch));
  return { doc: withEvents(doc, events), selected: at };
}

/** Types a note name: the pitch follows the key signature and lands in the octave closest to the previous note. */
export function typeStep(doc: ScoreDoc, selected: number | null, input: InputState, step: Step, addToChord: boolean): EditResult {
  const alter = keyAlterations(doc.key)[step];
  const reference = addToChord && selected !== null ? doc.events[selected]?.pitches.at(-1) ?? null : referencePitch(doc, selected);
  let pitch = nearestPitch(step, alter, reference, INSTRUMENTS[doc.instrument].defaultOctave);
  if (addToChord && reference && selected !== null) {
    // Chord tones are stacked above the previous chord tone.
    while (midiNumber(pitch) <= midiNumber(reference)) {
      pitch = { ...pitch, octave: pitch.octave + 1 };
    }
    return addPitch(doc, selected, pitch);
  }
  return place(doc, selected, input, { pitches: [pitch] });
}

export function insertPitch(doc: ScoreDoc, selected: number | null, input: InputState, pitch: Pitch, addToChord: boolean): EditResult {
  if (addToChord && selected !== null && doc.events[selected]?.pitches.length) return addPitch(doc, selected, pitch);
  return place(doc, selected, input, { pitches: [pitch] });
}

function addPitch(doc: ScoreDoc, index: number, pitch: Pitch): EditResult {
  const events = [...doc.events];
  const event = events[index];
  const exists = event.pitches.some((entry) => entry.step === pitch.step && entry.octave === pitch.octave && entry.alter === pitch.alter);
  events[index] = { ...event, pitches: exists ? event.pitches.filter((entry) => !(entry.step === pitch.step && entry.octave === pitch.octave)) : [...event.pitches, pitch] };
  return { doc: withEvents(doc, events), selected: index };
}

export function insertDrum(doc: ScoreDoc, selected: number | null, input: InputState, drum: DrumSound, addToChord: boolean): EditResult {
  if (addToChord && selected !== null && doc.events[selected]) {
    const events = [...doc.events];
    const event = events[selected];
    const drums = event.drums ?? [];
    events[selected] = { ...event, drums: drums.includes(drum) ? drums.filter((entry) => entry !== drum) : [...drums, drum] };
    return { doc: withEvents(doc, events), selected };
  }
  return place(doc, selected, input, { drums: [drum] });
}

export function insertRest(doc: ScoreDoc, selected: number | null, input: InputState): EditResult {
  if (selected !== null && doc.events[selected]) {
    // On a note: turn it into a rest (MuseScore "0" behaviour), otherwise append.
    const events = [...doc.events];
    const event = events[selected];
    if (event.pitches.length || event.drums?.length) {
      events[selected] = { ...event, pitches: [], drums: undefined, tie: undefined, accent: undefined, staccato: undefined };
      return { doc: withEvents(doc, events), selected };
    }
  }
  const events = [...doc.events];
  const at = selected === null ? events.length : selected + 1;
  events.splice(at, 0, newEvent(input, {}));
  return { doc: withEvents(doc, events), selected: at };
}

export function updateEvent(doc: ScoreDoc, index: number | null, patch: (event: ScoreEvent) => Partial<ScoreEvent>): EditResult {
  if (index === null || !doc.events[index]) return { doc, selected: index };
  const events = [...doc.events];
  events[index] = { ...events[index], ...patch(events[index]) };
  return { doc: withEvents(doc, events), selected: index };
}

export function deleteEvent(doc: ScoreDoc, index: number | null): EditResult {
  if (index === null || !doc.events[index]) return { doc, selected: index };
  const events = doc.events.filter((_, position) => position !== index);
  return { doc: withEvents(doc, events), selected: events.length === 0 ? null : Math.max(0, index - 1) };
}

/** Moves all pitches of the event by semitones; spelling follows direction and key. */
export function shiftPitch(doc: ScoreDoc, index: number | null, semitones: number): EditResult {
  const preferFlats = semitones < 0 || keyFifths(doc.key).fifths < 0;
  return updateEvent(doc, index, (event) => ({
    pitches: event.pitches.map((pitch) => (Math.abs(semitones) === 12 ? { ...pitch, octave: pitch.octave + Math.sign(semitones) } : transposePitch(pitch, semitones, preferFlats))),
  }));
}

export function setAccidental(doc: ScoreDoc, index: number | null, alter: number): EditResult {
  return updateEvent(doc, index, (event) => ({ pitches: event.pitches.map((pitch) => ({ ...pitch, alter })) }));
}

export const DURATION_KEYS: Record<string, BaseDuration> = { "1": 32, "2": 32, "3": 16, "4": 8, "5": 4, "6": 2, "7": 1 };
