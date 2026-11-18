import {
  DRUMS,
  KEYS,
  MAJOR_KEYS,
  MINOR_KEYS,
  emptyScore,
  keyFifths,
  newEventId,
  transposePitch,
  type BaseDuration,
  type DrumSound,
  type InstrumentId,
  type Pitch,
  type ScoreDoc,
  type ScoreEvent,
  type Step,
} from "@/lib/notation/model";

const TYPE_TO_DURATION: Record<string, BaseDuration> = { whole: 1, half: 2, quarter: 4, eighth: 8, "16th": 16, "32nd": 32 };

function text(element: Element | null | undefined, selector: string): string | null {
  return element?.querySelector(selector)?.textContent?.trim() ?? null;
}

function guessInstrument(name: string, clefSign: string | null, octaveChange: number): InstrumentId {
  const value = name.toLowerCase();
  if (clefSign === "percussion" || /drum|schlag|perc/.test(value)) return "drums";
  if (/bass/.test(value) && !/bassoon|fagott/.test(value)) return "bass";
  if (/guitar|gitarre/.test(value) || (clefSign === "G" && octaveChange === -1)) return "guitar";
  if (/voice|vocal|gesang|sopran|alt|tenor|stimme/.test(value)) return "voice";
  if (/violin|geige/.test(value)) return "violin";
  if (/trumpet|trompete/.test(value)) return "trumpet";
  if (/sax/.test(value)) return "sax";
  if (/flute|flöte/.test(value)) return "flute";
  if (clefSign === "F") return "bass";
  return "piano";
}

const MIDI_TO_DRUM = new Map<number, DrumSound>(
  (Object.keys(DRUMS) as DrumSound[]).map((drum) => [DRUMS[drum].midi, drum]),
);

function drumFromDisplay(step: string | null, octave: string | null, notehead: string | null): DrumSound {
  const id = `${step}${octave}`;
  const cymbal = notehead === "x" || notehead === "cross";
  const match = (Object.keys(DRUMS) as DrumSound[]).find((drum) => {
    const display = DRUMS[drum].display;
    return `${display.step}${display.octave}` === id && DRUMS[drum].cymbal === cymbal;
  });
  return match ?? (cymbal ? "hihat" : "snare");
}

/**
 * Imports the first part of an uncompressed MusicXML file (.musicxml/.xml) – e.g. exported from MuseScore.
 * Only the first voice is read; multi-voice passages are simplified.
 */
export function musicXmlToScore(source: string): { doc: ScoreDoc; title: string | null; warnings: string[] } {
  const warnings: string[] = [];
  const parsed = new DOMParser().parseFromString(source, "application/xml");
  if (parsed.querySelector("parsererror")) {
    throw new Error("Die Datei ist kein gültiges MusicXML.");
  }
  if (parsed.documentElement.nodeName === "score-timewise") {
    throw new Error("Timewise-MusicXML wird nicht unterstützt – bitte als „partwise“ exportieren.");
  }
  const part = parsed.querySelector("part");
  if (!part) throw new Error("Keine Stimme in der Datei gefunden.");
  if (parsed.querySelectorAll("part").length > 1) warnings.push("Nur die erste Stimme wurde importiert.");

  const partId = part.getAttribute("id");
  const partName = parsed.querySelector(`score-part[id="${partId}"] part-name`)?.textContent ?? "";
  const title = text(parsed.documentElement, "work > work-title") ?? text(parsed.documentElement, "movement-title");

  const firstAttributes = part.querySelector("measure attributes");
  const clefSign = text(firstAttributes, "clef > sign");
  const octaveChange = Number(text(firstAttributes, "clef > clef-octave-change") ?? 0);
  const instrument = guessInstrument(partName, clefSign, octaveChange);
  const fifths = Number(text(firstAttributes, "key > fifths") ?? 0);
  const mode = text(firstAttributes, "key > mode") === "minor" ? "minor" : "major";
  const key = (mode === "minor" ? MINOR_KEYS : MAJOR_KEYS).find((entry) => keyFifths(entry).fifths === fifths) ?? "C";
  const beats = text(firstAttributes, "time > beats") ?? "4";
  const beatType = text(firstAttributes, "time > beat-type") ?? "4";
  const tempoAttr = part.querySelector("sound[tempo]")?.getAttribute("tempo") ?? text(parsed.documentElement, "metronome > per-minute");

  const doc = emptyScore(instrument, { key: KEYS.includes(key) ? key : "C", meter: `${beats}/${beatType}`, tempo: Number(tempoAttr) || 100 });
  // Guitar/bass in octave clefs are stored as written pitch (one octave above sounding).
  const writtenShift = instrument === "guitar" || instrument === "bass" ? (octaveChange === -1 ? 12 : 0) : 0;
  let pendingChord: string | undefined;

  for (const measure of Array.from(part.querySelectorAll("measure"))) {
    for (const child of Array.from(measure.children)) {
      if (child.nodeName === "harmony") {
        const root = text(child, "root > root-step");
        const alter = Number(text(child, "root > root-alter") ?? 0);
        const suffix = child.querySelector("kind")?.getAttribute("text") ?? "";
        const kind = text(child, "kind") ?? "";
        const fallback: Record<string, string> = { minor: "m", dominant: "7", "major-seventh": "maj7", "minor-seventh": "m7", diminished: "dim", augmented: "aug", "suspended-fourth": "sus4" };
        const bass = text(child, "bass > bass-step");
        if (root) pendingChord = `${root}${alter > 0 ? "#" : alter < 0 ? "b" : ""}${suffix || fallback[kind] || ""}${bass ? `/${bass}` : ""}`;
        continue;
      }
      if (child.nodeName !== "note") continue;
      const voice = text(child, "voice");
      if (voice && voice !== "1") continue;
      if (child.querySelector("grace") || child.querySelector("cue")) continue;

      const typeName = text(child, "type");
      const duration = typeName ? TYPE_TO_DURATION[typeName] : undefined;
      const isChordTone = Boolean(child.querySelector("chord"));
      const previous = doc.events[doc.events.length - 1];

      if (isChordTone && previous) {
        if (instrument === "drums") {
          const drum = drumFromNote(child);
          if (drum) previous.drums = [...(previous.drums ?? []), drum];
        } else {
          const pitch = pitchFromNote(child, writtenShift);
          if (pitch) previous.pitches.push(pitch);
        }
        continue;
      }

      if (!duration) {
        if (child.querySelector("rest[measure='yes']") || child.querySelector("rest")) {
          // Whole-measure rest without type: approximate with whole notes for the bar length.
          doc.events.push({ id: newEventId(), pitches: [], duration: 1, dots: 0 });
        } else {
          warnings.push("Einige Noten mit ungewöhnlicher Länge wurden übersprungen.");
        }
        continue;
      }

      const event: ScoreEvent = {
        id: newEventId(),
        pitches: [],
        duration,
        dots: Math.min(2, child.querySelectorAll("dot").length) as 0 | 1 | 2,
        triplet: text(child, "time-modification > actual-notes") === "3" || undefined,
        tie: Boolean(child.querySelector('tie[type="start"]')) || undefined,
        chord: pendingChord,
        lyric: undefined,
        staccato: Boolean(child.querySelector("articulations staccato")) || undefined,
        accent: Boolean(child.querySelector("articulations accent")) || undefined,
      };
      pendingChord = undefined;

      if (!child.querySelector("rest")) {
        if (instrument === "drums") {
          const drum = drumFromNote(child);
          event.drums = drum ? [drum] : [];
        } else {
          const pitch = pitchFromNote(child, writtenShift);
          if (pitch) event.pitches.push(pitch);
        }
      }

      const lyric = child.querySelector("lyric");
      if (lyric) {
        const syllabic = text(lyric, "syllabic");
        const value = text(lyric, "text") ?? "";
        event.lyric = `${value}${syllabic === "begin" || syllabic === "middle" ? "-" : ""}` || undefined;
      }
      doc.events.push(event);
    }
  }

  if (doc.events.length > 4000) {
    doc.events = doc.events.slice(0, 4000);
    warnings.push("Sehr lange Partitur – nach 4000 Noten abgeschnitten.");
  }
  return { doc, title, warnings };
}

function pitchFromNote(note: Element, writtenShift: number): Pitch | null {
  const step = text(note, "pitch > step") as Step | null;
  const octave = Number(text(note, "pitch > octave"));
  if (!step || !Number.isFinite(octave)) return null;
  const pitch: Pitch = { step, alter: Number(text(note, "pitch > alter") ?? 0), octave };
  return writtenShift ? transposePitch(pitch, writtenShift, pitch.alter < 0) : pitch;
}

function drumFromNote(note: Element): DrumSound | null {
  const instrumentId = note.querySelector("instrument")?.getAttribute("id");
  if (instrumentId) {
    const root = note.ownerDocument;
    const unpitched = root.querySelector(`midi-instrument[id="${instrumentId}"] midi-unpitched`)?.textContent;
    const drum = unpitched ? MIDI_TO_DRUM.get(Number(unpitched) - 1) : undefined;
    if (drum) return drum;
  }
  if (!note.querySelector("unpitched")) return null;
  return drumFromDisplay(text(note, "unpitched > display-step"), text(note, "unpitched > display-octave"), text(note, "notehead"));
}
