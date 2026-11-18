import { diff3Merge } from "@/lib/merge/diff3";

export type TextRegion =
  | { ok: string[] }
  | { conflict: { base: string; ours: string; theirs: string; segment: string; line: number } };

export type Suggestion = { id: string; label: string; value: string; recommended?: boolean };

export function splitLines(text: string | null | undefined): string[] {
  if (!text) return [];
  return text.replace(/\r\n?/g, "\n").split("\n");
}

export function joinLines(lines: string[]): string {
  return lines.join("\n");
}

/** Words and whitespace as separate tokens – joining them gives the exact text back. */
export function tokenize(text: string): string[] {
  return text.match(/\s+|[^\s]+/g) ?? [];
}

const SECTION_NAMES: Record<string, string> = {
  verse: "Strophe", v: "Strophe", chorus: "Refrain", c: "Refrain", bridge: "Bridge", b: "Bridge",
  tab: "Tab", t: "Tab", grid: "Akkordraster", g: "Akkordraster",
};
const CHORD_ONLY = /^[A-H][#b]?(m|maj|min|dim|aug|sus|add|\d|\/|[#b])*$/;
const HEADING = /^(strophe|refrain|chorus|verse|bridge|intro|outro|pre-?chorus|solo|interlude|zwischenspiel|ende|coda)\b[^:]{0,30}:?$/i;

/** Name of the song section (ChordPro directive or heading) that contains the given line. */
export function sectionLabel(lines: readonly string[], lineIndex: number): string | null {
  for (let index = Math.min(lineIndex, lines.length - 1); index >= 0; index -= 1) {
    const line = lines[index].trim();
    if (!line) continue;
    const start = line.match(/^\{(?:start_of_|so)(verse|chorus|bridge|tab|grid|v|c|b|t|g)(?:\s*:\s*([^}]*))?\}$/i);
    if (start) return start[2]?.trim() || SECTION_NAMES[start[1].toLowerCase()] || null;
    if (/^\{(?:end_of_|eo)[a-z]+\}$/i.test(line)) return null;
    const comment = line.match(/^\{(?:c|comment|ci|comment_italic|cb|comment_box)\s*:\s*([^}]+)\}$/i);
    if (comment && comment[1].trim().length <= 40) return comment[1].trim();
    const bracket = line.match(/^\[([^\]]{2,30})\]$/);
    if (bracket && !CHORD_ONLY.test(bracket[1])) return bracket[1].trim();
    if (HEADING.test(line)) return line.replace(/:$/, "").trim();
  }
  return null;
}

/** Line-based three-way merge with a human-readable location for every conflict. */
export function mergeTextRegions(base: string, ours: string, theirs: string, options: { sections?: boolean } = {}): TextRegion[] {
  const oursLines = splitLines(ours);
  const regions = diff3Merge(splitLines(base), oursLines, splitLines(theirs));
  const result: TextRegion[] = [];
  let line = 0;
  for (const region of regions) {
    if ("ok" in region) {
      result.push({ ok: region.ok });
      line += region.ok.length;
      continue;
    }
    const section = options.sections ? sectionLabel(oursLines, line) : null;
    result.push({
      conflict: {
        base: joinLines(region.conflict.base),
        ours: joinLines(region.conflict.ours),
        theirs: joinLines(region.conflict.theirs),
        segment: section ?? `Zeile ${line + 1}`,
        line: line + 1,
      },
    });
    line += region.conflict.ours.length;
  }
  return result;
}

/** Word-level merge of one conflicting block – succeeds when both edited different words of the same lines. */
export function wordMerge(base: string, ours: string, theirs: string): string | null {
  const regions = diff3Merge(tokenize(base), tokenize(ours), tokenize(theirs));
  if (regions.some((region) => "conflict" in region)) return null;
  return regions.map((region) => ("ok" in region ? region.ok.join("") : "")).join("");
}

/** git-like resolution proposals for one conflicting block. */
export function textSuggestions(conflict: { base: string; ours: string; theirs: string }, names: { theirs: string }): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const combined = wordMerge(conflict.base, conflict.ours, conflict.theirs);
  if (combined !== null && combined !== conflict.ours && combined !== conflict.theirs) {
    suggestions.push({ id: "words", label: "Beide Änderungen kombiniert (wortweise)", value: combined, recommended: true });
  }
  suggestions.push(
    { id: "ours", label: conflict.ours ? "Deine Version" : "Deine Version (Zeilen entfernt)", value: conflict.ours },
    { id: "theirs", label: conflict.theirs ? `Version von ${names.theirs}` : `Version von ${names.theirs} (Zeilen entfernt)`, value: conflict.theirs },
  );
  if (conflict.ours && conflict.theirs) {
    suggestions.push(
      { id: "both-ours-first", label: "Beide untereinander – deine zuerst", value: `${conflict.ours}\n${conflict.theirs}` },
      { id: "both-theirs-first", label: `Beide untereinander – ${names.theirs} zuerst`, value: `${conflict.theirs}\n${conflict.ours}` },
    );
  }
  if (conflict.base && conflict.base !== conflict.ours && conflict.base !== conflict.theirs) {
    suggestions.push({ id: "base", label: "Ursprüngliche Fassung behalten", value: conflict.base });
  }
  if (!suggestions.some((suggestion) => suggestion.recommended)) {
    // Without a clean word merge, keeping both is the safest proposal – nothing gets lost.
    const both = suggestions.find((suggestion) => suggestion.id === "both-ours-first");
    if (both) both.recommended = true;
  }
  return suggestions;
}
