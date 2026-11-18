import {
  DRUMS,
  INSTRUMENTS,
  isRest,
  keyAlterations,
  layoutMeasures,
  parseMeter,
  type Pitch,
  type ScoreDoc,
  type ScoreEvent,
  type Step,
} from "@/lib/notation/model";

/** Character range of one rendered note/rest in the ABC source → event index (for click-to-select). */
export type AbcToken = { start: number; end: number; eventIndex: number; continuation: boolean };
export type AbcResult = { abc: string; tokens: AbcToken[]; measureCount: number };

const UNIT_TICKS = 120; // L:1/16

function lengthToken(ticks: number): string {
  const units = ticks / UNIT_TICKS;
  if (units === 1) return "";
  if (Number.isInteger(units)) return String(units);
  // 1/2, 3/2, 1/4, 3/4 …
  for (const denominator of [2, 4, 8]) {
    const numerator = units * denominator;
    if (Number.isInteger(numerator)) return numerator === 1 ? `/${denominator}` : `${numerator}/${denominator}`;
  }
  return "";
}

function pitchLetter(pitch: Pick<Pitch, "step" | "octave">): string {
  if (pitch.octave >= 5) return pitch.step.toLowerCase() + "'".repeat(pitch.octave - 5);
  return pitch.step + ",".repeat(Math.max(0, 4 - pitch.octave));
}

function accidentalToken(alter: number): string {
  return alter === 2 ? "^^" : alter === 1 ? "^" : alter === -1 ? "_" : alter === -2 ? "__" : "=";
}

function cleanText(value: string): string {
  return value.replace(/["\\|%\n\r]/g, "").trim();
}

function lyricToken(value: string): string {
  // ~ keeps multiple words under one note; strip characters with special meaning in w: lines.
  return cleanText(value).replace(/[_*|]/g, "").replace(/\s+/g, "~") || "*";
}

/**
 * Builds an ABC tune from the score. Accidentals are written relative to the key signature
 * and the accidentals already used in the bar, so the notation always matches the stored pitch.
 */
export function scoreToAbc(doc: ScoreDoc, options: { measuresPerLine?: number; title?: string } = {}): AbcResult {
  const measuresPerLine = Math.max(1, options.measuresPerLine ?? 4);
  const { beatTicks } = parseMeter(doc.meter);
  const measures = layoutMeasures(doc);
  const drums = doc.instrument === "drums";
  const keySig = keyAlterations(doc.key);
  const clef = drums ? "perc" : doc.clef;

  let abc = "X:1\n";
  if (options.title) abc += `T:${cleanText(options.title)}\n`;
  abc += `M:${doc.meter}\nL:1/16\nQ:1/4=${Math.round(doc.tempo)}\n`;
  abc += `K:${drums ? "C" : doc.key} clef=${clef}${drums ? " stafflines=5" : ""}\n`;

  const tokens: AbcToken[] = [];
  const hasLyrics = doc.events.some((event) => event.lyric);
  let tripletLeft = 0;

  for (let lineStart = 0; lineStart < measures.length; lineStart += measuresPerLine) {
    const lineMeasures = measures.slice(lineStart, lineStart + measuresPerLine);
    let line = "";
    const lyrics: string[] = [];

    lineMeasures.forEach((measure, measureOffset) => {
      const barState = new Map<string, number>();
      let positionInMeasure = 0;

      measure.pieces.forEach((piece, pieceIndex) => {
        const event = doc.events[piece.eventIndex] as ScoreEvent;
        const rest = isRest(event);
        // Break beams at beat boundaries and around quarter notes or longer.
        const onBeat = positionInMeasure % beatTicks === 0;
        if (pieceIndex > 0 && (onBeat || piece.ticks >= beatTicks)) line += " ";

        let token = "";
        if (piece.triplet && tripletLeft === 0) {
          token += "(3";
          tripletLeft = 3;
        }
        if (piece.triplet) tripletLeft -= 1;
        else tripletLeft = 0;

        if (!piece.continuation && event.chord) token += `"${cleanText(event.chord)}"`;
        if (!piece.continuation && !rest) {
          if (event.accent) token += "!accent!";
          if (event.staccato) token += ".";
        }

        const baseTicks = piece.triplet ? (1920 / piece.duration) * (piece.dots === 1 ? 1.5 : piece.dots === 2 ? 1.75 : 1) : piece.ticks;
        const length = lengthToken(baseTicks);

        if (rest) {
          token += `z${length}`;
        } else {
          const heads: string[] = [];
          if (drums) {
            for (const drum of event.drums ?? []) {
              const info = DRUMS[drum];
              heads.push(`${info.cymbal ? "!style=x!" : ""}${drum === "hihat-open" ? "!open!" : ""}${pitchLetter(info.display)}`);
            }
          } else {
            const sorted = [...event.pitches].sort((a, b) => a.octave * 7 + "CDEFGAB".indexOf(a.step) - (b.octave * 7 + "CDEFGAB".indexOf(b.step)));
            for (const pitch of sorted) {
              const stateKey = `${pitch.step}${pitch.octave}`;
              const current = barState.get(stateKey) ?? keySig[pitch.step as Step];
              const accidental = pitch.alter !== current ? accidentalToken(pitch.alter) : "";
              barState.set(stateKey, pitch.alter);
              heads.push(`${accidental}${pitchLetter(pitch)}`);
            }
          }
          const tie = piece.tieNext ? "-" : "";
          token += heads.length > 1 ? `[${heads.join("")}]${length}${tie}` : `${heads[0]}${length}${tie}`;
          lyrics.push(piece.continuation ? "_" : event.lyric ? lyricToken(event.lyric) : "*");
        }

        const start = abc.length + line.length;
        line += token;
        tokens.push({ start, end: start + token.length, eventIndex: piece.eventIndex, continuation: piece.continuation });
        positionInMeasure += piece.ticks;
      });

      const lastMeasure = lineStart + measureOffset === measures.length - 1;
      line += lastMeasure ? " |]" : " |";
      if (measureOffset < lineMeasures.length - 1) line += " ";
    });

    abc += `${line}\n`;
    if (hasLyrics && lyrics.length > 0) {
      let lyricLine = "";
      lyrics.forEach((syllable, index) => {
        lyricLine += index === 0 || lyrics[index - 1].endsWith("-") ? syllable : ` ${syllable}`;
      });
      abc += `w:${lyricLine}\n`;
    }
  }

  if (measures.every((measure) => measure.pieces.length === 0)) {
    // Empty score: show an empty bar with a full rest so the staff is visible.
    abc += "x16 |]\n";
  }

  return { abc, tokens, measureCount: measures.length };
}

export function tablatureFor(doc: ScoreDoc): Array<{ instrument: "guitar"; label: string; tuning: string[] }> | undefined {
  if (!doc.tab) return undefined;
  const info = INSTRUMENTS[doc.instrument];
  if (!info.tuning) return undefined;
  return [{ instrument: "guitar", label: doc.instrument === "bass" ? "Bass" : "Gitarre", tuning: info.tuning }];
}

/** abcjs reports the start of an element including leading whitespace (e.g. after a barline). */
export function tokenAt(tokens: AbcToken[], charPosition: number): AbcToken | null {
  return tokens.find((token) => charPosition >= token.start && charPosition < token.end)
    ?? tokens.find((token) => token.start >= charPosition && token.start - charPosition <= 3)
    ?? null;
}
