/** Small music helpers used by the lead sheet, stage mode and Spotify embeds. */

const SHARP_NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_NOTES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const NOTE_INDEX: Record<string, number> = {
  C: 0, "B#": 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, Fb: 4, F: 5, "E#": 5,
  "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11, Cb: 11, H: 11,
};

/** Transposes a key label like "Am", "F#", "Bb Dur" by the given number of semitones. */
export function transposeKey(key: string | null | undefined, semitones: number): string | null {
  if (!key) {
    return null;
  }
  if (!semitones) {
    return key;
  }
  const match = key.trim().match(/^([A-H])([#b]?)(.*)$/);
  if (!match) {
    return key;
  }
  const root = `${match[1] === "H" ? "B" : match[1]}${match[2]}`;
  const index = NOTE_INDEX[root];
  if (index === undefined) {
    return key;
  }
  const preferFlats = match[2] === "b" || ["F", "Bb", "Eb", "Ab", "Db", "Gb"].includes(root);
  const next = ((index + semitones) % 12 + 12) % 12;
  return `${(preferFlats ? FLAT_NOTES : SHARP_NOTES)[next]}${match[3]}`;
}

/** Transposes a chord symbol including slash bass notes ("G/B" → "A/C#"). */
export function transposeChord(chord: string, semitones: number): string {
  const [main, bass] = chord.split("/");
  const next = transposeKey(main, semitones) ?? main;
  return bass ? `${next}/${transposeKey(bass, semitones) ?? bass}` : next;
}

export function toSpotifyEmbedUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) {
    return null;
  }
  try {
    if (rawUrl.startsWith("spotify:")) {
      const [, type, id] = rawUrl.split(":");
      return type && id ? `https://open.spotify.com/embed/${type}/${id}` : null;
    }
    const url = new URL(rawUrl.trim());
    if (!url.hostname.endsWith("spotify.com")) {
      return null;
    }
    const segments = url.pathname.split("/").filter(Boolean);
    const allowed = new Set(["track", "album", "playlist", "artist", "episode", "show"]);
    for (let index = 0; index < segments.length - 1; index += 1) {
      if (allowed.has(segments[index]) && segments[index + 1]) {
        return `https://open.spotify.com/embed/${segments[index]}/${segments[index + 1]}`;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function toYouTubeEmbedUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) {
    return null;
  }
  try {
    const url = new URL(rawUrl.trim());
    if (url.hostname === "youtu.be") {
      return `https://www.youtube-nocookie.com/embed/${url.pathname.slice(1)}`;
    }
    if (url.hostname.endsWith("youtube.com")) {
      const id = url.searchParams.get("v") ?? url.pathname.split("/").filter(Boolean).at(-1);
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }
    return null;
  } catch {
    return null;
  }
}

export const COMMON_KEYS = [
  "C", "Cm", "C#", "C#m", "Db", "D", "Dm", "D#m", "Eb", "Ebm", "E", "Em", "F", "Fm", "F#", "F#m",
  "Gb", "G", "Gm", "G#m", "Ab", "A", "Am", "Bb", "Bbm", "B", "Bm",
];
