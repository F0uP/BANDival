import {
  DRUMS,
  INSTRUMENTS,
  isRest,
  keyFifths,
  layoutMeasures,
  midiNumber,
  parseMeter,
  playbackNotes,
  transposePitch,
  type BaseDuration,
  type DrumSound,
  type ScoreDoc,
} from "@/lib/notation/model";

/* ---------------- MIDI (SMF type 0, 480 PPQ) ---------------- */

function varLength(value: number): number[] {
  const bytes = [value & 0x7f];
  let rest = value >> 7;
  while (rest > 0) {
    bytes.unshift((rest & 0x7f) | 0x80);
    rest >>= 7;
  }
  return bytes;
}

export function scoreToMidi(doc: ScoreDoc): Uint8Array {
  const drums = doc.instrument === "drums";
  const channel = drums ? 9 : 0;
  const { beats, beatType } = parseMeter(doc.meter);
  const tempoMicros = Math.round(60_000_000 / doc.tempo);
  const notes = playbackNotes(doc);

  type MidiEvent = { tick: number; order: number; bytes: number[] };
  const events: MidiEvent[] = [
    { tick: 0, order: 0, bytes: [0xff, 0x51, 0x03, (tempoMicros >> 16) & 0xff, (tempoMicros >> 8) & 0xff, tempoMicros & 0xff] },
    { tick: 0, order: 0, bytes: [0xff, 0x58, 0x04, beats, Math.log2(beatType), 24, 8] },
    { tick: 0, order: 0, bytes: [0xff, 0x59, 0x02, keyFifths(doc.key).fifths & 0xff, keyFifths(doc.key).mode === "minor" ? 1 : 0] },
  ];
  if (!drums) events.push({ tick: 0, order: 1, bytes: [0xc0 | channel, INSTRUMENTS[doc.instrument].gmProgram] });

  for (const note of notes) {
    const velocity = note.accent ? 118 : 92;
    const length = note.staccato ? Math.max(30, Math.round(note.ticks / 2)) : Math.max(1, note.ticks - 10);
    const keys = drums ? note.drums.map((drum) => DRUMS[drum].midi) : note.midi;
    for (const key of keys) {
      const clamped = Math.max(0, Math.min(127, key));
      events.push({ tick: note.startTick, order: 3, bytes: [0x90 | channel, clamped, velocity] });
      events.push({ tick: note.startTick + length, order: 2, bytes: [0x80 | channel, clamped, 0] });
    }
  }
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);

  const track: number[] = [];
  let last = 0;
  for (const event of events) {
    track.push(...varLength(event.tick - last), ...event.bytes);
    last = event.tick;
  }
  track.push(0x00, 0xff, 0x2f, 0x00);

  const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, (480 >> 8) & 0xff, 480 & 0xff];
  const length = track.length;
  return new Uint8Array([
    ...header,
    0x4d, 0x54, 0x72, 0x6b, (length >> 24) & 0xff, (length >> 16) & 0xff, (length >> 8) & 0xff, length & 0xff,
    ...track,
  ]);
}

/* ---------------- MusicXML 4.0 ---------------- */

function xml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const TYPE_NAME: Record<BaseDuration, string> = { 1: "whole", 2: "half", 4: "quarter", 8: "eighth", 16: "16th", 32: "32nd" };

function harmonyXml(chord: string): string {
  const match = /^([A-G])([#b]?)(.*?)(?:\/([A-G])([#b]?))?$/.exec(chord.trim());
  if (!match) return "";
  const [, root, rootAcc, suffixRaw, bass, bassAcc] = match;
  const suffix = suffixRaw.trim();
  const kinds: Array<[RegExp, string]> = [
    [/^$/, "major"], [/^(m|min|-)$/, "minor"], [/^7$/, "dominant"], [/^(maj7|M7|Δ7?)$/, "major-seventh"],
    [/^(m7|min7|-7)$/, "minor-seventh"], [/^(dim|°)$/, "diminished"], [/^(dim7|°7)$/, "diminished-seventh"],
    [/^(m7b5|ø)$/, "half-diminished"], [/^(aug|\+)$/, "augmented"], [/^sus4?$/, "suspended-fourth"],
    [/^sus2$/, "suspended-second"], [/^6$/, "major-sixth"], [/^m6$/, "minor-sixth"], [/^9$/, "dominant-ninth"],
    [/^(5|power)$/, "power"],
  ];
  const kind = kinds.find(([pattern]) => pattern.test(suffix))?.[1] ?? "other";
  const alter = (value: string) => (value === "#" ? "<root-alter>1</root-alter>" : value === "b" ? "<root-alter>-1</root-alter>" : "");
  return `<harmony><root><root-step>${root}</root-step>${alter(rootAcc)}</root><kind text="${xml(suffix)}">${kind}</kind>${
    bass ? `<bass><bass-step>${bass}</bass-step>${bassAcc === "#" ? "<bass-alter>1</bass-alter>" : bassAcc === "b" ? "<bass-alter>-1</bass-alter>" : ""}</bass>` : ""
  }</harmony>`;
}

const DRUM_INSTRUMENT_ID = (drum: DrumSound) => `P1-I${DRUMS[drum].midi}`;

export function scoreToMusicXml(doc: ScoreDoc, title: string): string {
  const info = INSTRUMENTS[doc.instrument];
  const drums = doc.instrument === "drums";
  const { beats, beatType } = parseMeter(doc.meter);
  const { fifths, mode } = keyFifths(doc.key);
  const measures = layoutMeasures(doc);
  // Guitar & bass: octave clef, pitches exported as sounding pitch (MuseScore convention).
  const octaveShift = info.soundingOffset === -12;

  const clefXml = drums
    ? "<clef><sign>percussion</sign></clef>"
    : doc.clef === "bass"
      ? `<clef><sign>F</sign><line>4</line>${octaveShift ? "<clef-octave-change>-1</clef-octave-change>" : ""}</clef>`
      : `<clef><sign>G</sign><line>2</line>${octaveShift ? "<clef-octave-change>-1</clef-octave-change>" : ""}</clef>`;

  const partList = drums
    ? `<score-part id="P1"><part-name>${xml(info.label)}</part-name>${(Object.keys(DRUMS) as DrumSound[])
      .map((drum) => `<score-instrument id="${DRUM_INSTRUMENT_ID(drum)}"><instrument-name>${xml(DRUMS[drum].label)}</instrument-name></score-instrument>`)
      .join("")}${(Object.keys(DRUMS) as DrumSound[])
      .map((drum) => `<midi-instrument id="${DRUM_INSTRUMENT_ID(drum)}"><midi-channel>10</midi-channel><midi-unpitched>${DRUMS[drum].midi + 1}</midi-unpitched></midi-instrument>`)
      .join("")}</score-part>`
    : `<score-part id="P1"><part-name>${xml(info.label)}</part-name><score-instrument id="P1-I1"><instrument-name>${xml(info.label)}</instrument-name></score-instrument><midi-instrument id="P1-I1"><midi-channel>1</midi-channel><midi-program>${info.gmProgram + 1}</midi-program></midi-instrument></score-part>`;

  const lyricState = { open: false };
  const body = measures.map((measure, measureIndex) => {
    let content = "";
    if (measureIndex === 0) {
      content += `<attributes><divisions>480</divisions><key><fifths>${drums ? 0 : fifths}</fifths><mode>${mode}</mode></key><time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time>${clefXml}</attributes>`;
      content += `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${Math.round(doc.tempo)}</per-minute></metronome></direction-type><sound tempo="${Math.round(doc.tempo)}"/></direction>`;
    }
    for (const piece of measure.pieces) {
      const event = doc.events[piece.eventIndex];
      const rest = isRest(event);
      if (!piece.continuation && event.chord) content += harmonyXml(event.chord);
      const tieStart = piece.tieNext && !rest;
      const tieStop = piece.continuation || (piece.eventIndex > 0 && Boolean(doc.events[piece.eventIndex - 1]?.tie) && !piece.continuation);
      const timeMod = piece.triplet ? "<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>" : "";
      const dots = "<dot/>".repeat(piece.dots);
      const heads: string[] = [];

      if (rest) {
        heads.push("<rest/>");
      } else if (drums) {
        for (const drum of event.drums ?? []) {
          const display = DRUMS[drum].display;
          heads.push(`<unpitched><display-step>${display.step}</display-step><display-octave>${display.octave}</display-octave></unpitched>|${drum}`);
        }
      } else {
        for (const pitch of event.pitches) {
          const sounding = octaveShift ? transposePitch(pitch, -12, pitch.alter < 0) : pitch;
          heads.push(`<pitch><step>${sounding.step}</step>${sounding.alter ? `<alter>${sounding.alter}</alter>` : ""}<octave>${sounding.octave}</octave></pitch>`);
        }
      }

      heads.forEach((head, headIndex) => {
        const [headXml, drum] = head.split("|");
        const notations: string[] = [];
        if (tieStop && !rest) notations.push('<tied type="stop"/>');
        if (tieStart) notations.push('<tied type="start"/>');
        const articulations = !piece.continuation && !rest
          ? `${event.accent ? "<accent/>" : ""}${event.staccato ? "<staccato/>" : ""}`
          : "";
        if (articulations && headIndex === 0) notations.push(`<articulations>${articulations}</articulations>`);
        let lyric = "";
        if (headIndex === 0 && !rest && !piece.continuation && event.lyric) {
          const text = event.lyric.trim();
          const continues = text.endsWith("-");
          const syllabic = lyricState.open ? (continues ? "middle" : "end") : continues ? "begin" : "single";
          lyricState.open = continues;
          lyric = `<lyric number="1"><syllabic>${syllabic}</syllabic><text>${xml(text.replace(/-$/, ""))}</text></lyric>`;
        }
        content += `<note>${headIndex > 0 ? "<chord/>" : ""}${headXml}<duration>${piece.ticks}</duration>${
          tieStop && !rest ? '<tie type="stop"/>' : ""
        }${tieStart ? '<tie type="start"/>' : ""}${drum ? `<instrument id="${DRUM_INSTRUMENT_ID(drum as DrumSound)}"/>` : ""}<voice>1</voice><type>${TYPE_NAME[piece.duration]}</type>${dots}${timeMod}${
          drum && DRUMS[drum as DrumSound].cymbal ? "<notehead>x</notehead>" : ""
        }${notations.length ? `<notations>${notations.join("")}</notations>` : ""}${lyric}</note>`;
      });
    }
    const barline = measureIndex === measures.length - 1 ? '<barline location="right"><bar-style>light-heavy</bar-style></barline>' : "";
    return `<measure number="${measureIndex + 1}">${content}${barline}</measure>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0"><work><work-title>${xml(title)}</work-title></work><identification><encoding><software>Bandival</software></encoding></identification><part-list>${partList}</part-list><part id="P1">${body}</part></score-partwise>`;
}

export function downloadBlob(data: BlobPart, fileName: string, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFileName(value: string): string {
  return value.normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "noten";
}

export { midiNumber };
