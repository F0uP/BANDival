/**
 * Three-way merge of sequences (lines, words, ids) in the spirit of `git merge-file` / diff3.
 * Pure TypeScript, shared by server and client.
 */

export type MergeRegion =
  | { ok: string[] }
  | { conflict: { base: string[]; ours: string[]; theirs: string[] } };

/** Above this many DP cells the middle part is treated as completely rewritten (keeps memory bounded). */
const MAX_CELLS = 2_500_000;

/** Index pairs of a longest common subsequence; common prefix and suffix are matched directly. */
export function lcsMatches(a: readonly string[], b: readonly string[]): Array<[number, number]> {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1;
    endB -= 1;
  }

  const pairs: Array<[number, number]> = [];
  for (let index = 0; index < start; index += 1) pairs.push([index, index]);

  const n = endA - start;
  const m = endB - start;
  if (n > 0 && m > 0 && n * m <= MAX_CELLS) {
    const width = m + 1;
    const table = new Uint32Array((n + 1) * width);
    for (let i = n - 1; i >= 0; i -= 1) {
      for (let j = m - 1; j >= 0; j -= 1) {
        table[i * width + j] = a[start + i] === b[start + j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a[start + i] === b[start + j]) {
        pairs.push([start + i, start + j]);
        i += 1;
        j += 1;
      } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
        i += 1;
      } else {
        j += 1;
      }
    }
  }

  for (let offset = 0; offset < a.length - endA; offset += 1) pairs.push([endA + offset, endB + offset]);
  return pairs;
}

type Hunk = { baseStart: number; baseEnd: number; side: "ours" | "theirs"; start: number; end: number };

/** Changed ranges of `other` relative to `base`. */
function changeHunks(base: readonly string[], other: readonly string[], side: Hunk["side"]): Hunk[] {
  const hunks: Hunk[] = [];
  let previousBase = -1;
  let previousOther = -1;
  for (const [baseIndex, otherIndex] of [...lcsMatches(base, other), [base.length, other.length] as [number, number]]) {
    if (baseIndex - previousBase > 1 || otherIndex - previousOther > 1) {
      hunks.push({ baseStart: previousBase + 1, baseEnd: baseIndex, side, start: previousOther + 1, end: otherIndex });
    }
    previousBase = baseIndex;
    previousOther = otherIndex;
  }
  return hunks;
}

/** Content of one side for the base range [from, to) – unchanged stretches come from the base. */
function sideContent(group: Hunk[], side: Hunk["side"], lines: readonly string[], base: readonly string[], from: number, to: number): string[] {
  const out: string[] = [];
  let position = from;
  for (const hunk of group) {
    if (hunk.side !== side) continue;
    out.push(...base.slice(position, hunk.baseStart), ...lines.slice(hunk.start, hunk.end));
    position = hunk.baseEnd;
  }
  out.push(...base.slice(position, to));
  return out;
}

function sameSequence(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * Merges `ours` and `theirs`, both derived from `base`. Changes of only one side are taken over,
 * identical changes are deduplicated, and overlapping or adjacent changes become conflicts (like git).
 */
export function diff3Merge(base: readonly string[], ours: readonly string[], theirs: readonly string[]): MergeRegion[] {
  const hunks = [...changeHunks(base, ours, "ours"), ...changeHunks(base, theirs, "theirs")]
    .sort((a, b) => a.baseStart - b.baseStart || (a.side === b.side ? 0 : a.side === "ours" ? -1 : 1));

  const regions: MergeRegion[] = [];
  const pushOk = (lines: string[]) => {
    if (lines.length === 0) return;
    const last = regions.at(-1);
    if (last && "ok" in last) last.ok.push(...lines);
    else regions.push({ ok: [...lines] });
  };

  let basePosition = 0;
  let index = 0;
  while (index < hunks.length) {
    const group = [hunks[index]];
    const groupStart = hunks[index].baseStart;
    let groupEnd = hunks[index].baseEnd;
    index += 1;
    while (index < hunks.length && hunks[index].baseStart <= groupEnd) {
      group.push(hunks[index]);
      groupEnd = Math.max(groupEnd, hunks[index].baseEnd);
      index += 1;
    }

    pushOk(base.slice(basePosition, groupStart));
    const oursContent = sideContent(group, "ours", ours, base, groupStart, groupEnd);
    const theirsContent = sideContent(group, "theirs", theirs, base, groupStart, groupEnd);
    const sides = new Set(group.map((hunk) => hunk.side));
    if (sides.size === 1) {
      pushOk(sides.has("ours") ? oursContent : theirsContent);
    } else if (sameSequence(oursContent, theirsContent)) {
      pushOk(oursContent);
    } else {
      regions.push({ conflict: { base: base.slice(groupStart, groupEnd), ours: oursContent, theirs: theirsContent } });
    }
    basePosition = groupEnd;
  }
  pushOk(base.slice(basePosition));
  return regions;
}

export function hasConflicts(regions: MergeRegion[]): boolean {
  return regions.some((region) => "conflict" in region);
}
