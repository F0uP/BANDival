import { diff3Merge } from "@/lib/merge/diff3";
import { joinLines, mergeTextRegions, splitLines, textSuggestions } from "@/lib/merge/text";

/*
 * Three-way merge of structured documents (song, setlist, part, score):
 * scalars per field, texts per line (with word-level proposals), sets by membership,
 * lists by item id (+ order via diff3). Shared by server (merge on save) and client (rebase while editing).
 */

type Item = Record<string, unknown>;

export type FieldSpec =
  | { kind: "scalar"; label: string; format?: (value: unknown) => string }
  | { kind: "text"; label: string; sections?: boolean }
  | { kind: "set"; label: string }
  | { kind: "object"; label: string; fields: Record<string, FieldSpec> }
  | { kind: "list"; label: string; itemFields: Record<string, FieldSpec>; itemLabel: (item: Item, index: number, labels: Record<string, string>) => string };

export type DocSpec = Record<string, FieldSpec>;

export type ConflictOption = { id: string; label: string; value: unknown; preview?: string; recommended?: boolean };

export type DocConflict = {
  id: string;
  label: string;
  kind: "text" | "scalar" | "presence" | "order";
  base: string | null;
  ours: string;
  theirs: string;
  options: ConflictOption[];
};

export type Choice = { option?: string; value?: unknown };

export type MergeContext = {
  /** Display name of the other side, e.g. "Sam". */
  theirsName: string;
  /** Chosen resolutions by conflict id (option id or a custom value). */
  choices?: Record<string, Choice>;
  /** Display labels for list item ids (e.g. song titles in a setlist). */
  labels?: Record<string, string>;
};

/** JSON with sorted keys; `undefined` counts as missing – used for equality checks. */
export function stableStringify(value: unknown): string {
  if (value === undefined || value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Item).filter(([, entry]) => entry !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function same(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

function defaultFormat(value: unknown): string {
  if (value === null || value === undefined || value === "") return "(leer)";
  if (typeof value === "boolean") return value ? "Ja" : "Nein";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function asItems(value: unknown): Item[] {
  return Array.isArray(value) ? value.filter((entry): entry is Item => Boolean(entry) && typeof entry === "object" && typeof (entry as Item).id === "string") : [];
}

function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

class Merger {
  readonly conflicts: DocConflict[] = [];

  constructor(private readonly context: MergeContext) {}

  /** Applies a stored choice – or records the conflict and returns the fallback (server state). */
  private decide(conflict: DocConflict, fallback: unknown): unknown {
    const choice = this.context.choices?.[conflict.id];
    if (choice?.option !== undefined) {
      const option = conflict.options.find((entry) => entry.id === choice.option);
      if (option) return option.value;
    } else if (choice && "value" in choice && (conflict.kind === "text" || conflict.kind === "scalar")) {
      return conflict.kind === "text" ? String(choice.value ?? "") : choice.value;
    }
    this.conflicts.push(conflict);
    return fallback;
  }

  merge(spec: FieldSpec, path: string, label: string, base: unknown, ours: unknown, theirs: unknown, hasBase: boolean): unknown {
    switch (spec.kind) {
      case "scalar": return this.scalar(spec, path, label, base, ours, theirs, hasBase);
      case "text": return this.text(spec, path, label, base, ours, theirs, hasBase);
      case "set": return this.set(base, ours, theirs, hasBase);
      case "object": return this.object(spec.fields, path, label, base, ours, theirs, hasBase);
      case "list": return this.list(spec, path, label, base, ours, theirs, hasBase);
    }
  }

  private scalar(spec: Extract<FieldSpec, { kind: "scalar" }>, path: string, label: string, base: unknown, ours: unknown, theirs: unknown, hasBase: boolean) {
    if (same(ours, theirs)) return ours;
    if (hasBase && same(base, ours)) return theirs;
    if (hasBase && same(base, theirs)) return ours;
    const format = spec.format ?? defaultFormat;
    const options: ConflictOption[] = [
      { id: "ours", label: "Deine Version", value: ours, preview: format(ours) },
      { id: "theirs", label: `Version von ${this.context.theirsName}`, value: theirs, preview: format(theirs) },
    ];
    if (hasBase && !same(base, ours) && !same(base, theirs)) options.push({ id: "base", label: "Ursprünglicher Wert", value: base, preview: format(base) });
    return this.decide({ id: path, label, kind: "scalar", base: hasBase ? format(base) : null, ours: format(ours), theirs: format(theirs), options }, theirs);
  }

  private text(spec: Extract<FieldSpec, { kind: "text" }>, path: string, label: string, base: unknown, ours: unknown, theirs: unknown, hasBase: boolean) {
    const b = typeof base === "string" ? base : "";
    const o = typeof ours === "string" ? ours : "";
    const t = typeof theirs === "string" ? theirs : "";
    if (o === t) return ours ?? theirs ?? null;
    if (hasBase && b === o) return theirs;
    if (hasBase && b === t) return ours;
    const lines: string[] = [];
    let index = 0;
    for (const region of mergeTextRegions(hasBase ? b : "", o, t, { sections: spec.sections })) {
      if ("ok" in region) {
        lines.push(...region.ok);
        continue;
      }
      const conflict = region.conflict;
      const options = textSuggestions(conflict, { theirs: this.context.theirsName }).map((suggestion) => ({ ...suggestion }));
      const value = this.decide({
        id: `${path}#${index}`,
        label: `${label} · ${conflict.segment}`,
        kind: "text",
        base: hasBase ? conflict.base : null,
        ours: conflict.ours,
        theirs: conflict.theirs,
        options,
      }, conflict.theirs);
      index += 1;
      lines.push(...splitLines(String(value ?? "")));
    }
    const merged = joinLines(lines);
    return merged === "" && ours === null && theirs === null ? null : merged;
  }

  private set(base: unknown, ours: unknown, theirs: unknown, hasBase: boolean) {
    const o = asStrings(ours);
    const t = asStrings(theirs);
    if (!hasBase) return [...t, ...o.filter((entry) => !t.includes(entry))];
    const b = new Set(asStrings(base));
    const added = o.filter((entry) => !b.has(entry));
    const removed = new Set([...b].filter((entry) => !o.includes(entry)));
    return [...t.filter((entry) => !removed.has(entry)), ...added.filter((entry) => !t.includes(entry))];
  }

  private object(fields: Record<string, FieldSpec>, path: string, label: string, base: unknown, ours: unknown, theirs: unknown, hasBase: boolean) {
    const b = (base && typeof base === "object" ? base : {}) as Item;
    const o = (ours && typeof ours === "object" ? ours : {}) as Item;
    const t = (theirs && typeof theirs === "object" ? theirs : {}) as Item;
    const result: Item = {};
    const keys = new Set([...Object.keys(t), ...Object.keys(o), ...Object.keys(b)]);
    for (const key of keys) {
      const spec = fields[key] ?? { kind: "scalar", label: key };
      const childPath = path ? `${path}.${key}` : key;
      const childLabel = label ? `${label} · ${spec.label}` : spec.label;
      const value = this.merge(spec, childPath, childLabel, b[key], o[key], t[key], hasBase);
      if (value !== undefined) result[key] = value;
    }
    return result;
  }

  private list(spec: Extract<FieldSpec, { kind: "list" }>, path: string, label: string, base: unknown, ours: unknown, theirs: unknown, hasBase: boolean) {
    const labels = this.context.labels ?? {};
    const baseItems = asItems(base);
    const oursItems = asItems(ours);
    const theirsItems = asItems(theirs);
    const B = new Map(baseItems.map((item) => [item.id as string, item]));
    const O = new Map(oursItems.map((item) => [item.id as string, item]));
    const T = new Map(theirsItems.map((item) => [item.id as string, item]));
    const position = (id: string) => Math.max(oursItems.findIndex((item) => item.id === id), theirsItems.findIndex((item) => item.id === id), 0);
    const itemName = (id: string) => spec.itemLabel((O.get(id) ?? T.get(id) ?? B.get(id)) as Item, position(id), labels);

    const merged = new Map<string, Item>();
    const ids = [...new Set([...T.keys(), ...O.keys(), ...B.keys()])];
    for (const id of ids) {
      const b = B.get(id);
      const o = O.get(id);
      const t = T.get(id);
      const itemPath = `${path}[${id}]`;
      const itemLabel = `${label} · ${itemName(id)}`;
      if (o && t) {
        merged.set(id, this.object(spec.itemFields, itemPath, itemLabel, b, o, t, hasBase && Boolean(b)) as Item);
        continue;
      }
      if (!o && !t) continue;
      if (o && !t) {
        if (!b || !hasBase) { merged.set(id, o); continue; }
        if (same(b, o)) continue;
        const keep = this.decide({
          id: `${itemPath}:presence`, label: itemLabel, kind: "presence", base: "vorhanden", ours: "geändert", theirs: "gelöscht",
          options: [
            { id: "keep", label: "Behalten – mit deinen Änderungen", value: true, recommended: true },
            { id: "delete", label: `Löschen – wie von ${this.context.theirsName}`, value: false },
          ],
        }, false);
        if (keep) merged.set(id, o);
        continue;
      }
      if (t && !o) {
        if (!b || !hasBase) { merged.set(id, t); continue; }
        if (same(b, t)) continue;
        const keep = this.decide({
          id: `${itemPath}:presence`, label: itemLabel, kind: "presence", base: "vorhanden", ours: "gelöscht", theirs: "geändert",
          options: [
            { id: "delete", label: "Löschen – wie von dir gewollt", value: false },
            { id: "keep", label: `Behalten – mit den Änderungen von ${this.context.theirsName}`, value: true, recommended: true },
          ],
        }, true);
        if (keep) merged.set(id, t);
      }
    }

    // Order: diff3 over the ids that survive.
    const alive = (items: Item[]) => items.map((item) => item.id as string).filter((id) => merged.has(id));
    const regions = diff3Merge(hasBase ? alive(baseItems) : [], alive(oursItems), alive(theirsItems));
    const describe = (orderIds: string[]) => orderIds.map((id, index) => `${index + 1}. ${itemName(id)}`).join("\n");
    let order: string[];
    if (regions.every((region) => "ok" in region)) {
      order = regions.flatMap((region) => ("ok" in region ? region.ok : []));
      // Both moved the same item to different places → it shows up twice: that is a conflict.
      const moved = order.filter((id, index) => order.indexOf(id) !== index);
      if (moved.length > 0) {
        const placeLike = (reference: string[]) => {
          let result = [...new Set(order)];
          for (const id of new Set(moved)) {
            result = result.filter((entry) => entry !== id);
            const previous = reference[reference.indexOf(id) - 1];
            const at = previous !== undefined && result.includes(previous) ? result.indexOf(previous) + 1 : 0;
            result.splice(at, 0, id);
          }
          return result;
        };
        const oursOrder = placeLike(alive(oursItems));
        const theirsOrder = placeLike(alive(theirsItems));
        order = this.decide({
          id: `${path}:order`,
          label: `${label} · Reihenfolge`,
          kind: "order",
          base: hasBase ? describe(alive(baseItems)) : null,
          ours: describe(oursOrder),
          theirs: describe(theirsOrder),
          options: [
            { id: "ours", label: "Deine Reihenfolge", value: oursOrder, preview: describe(oursOrder) },
            { id: "theirs", label: `Reihenfolge von ${this.context.theirsName}`, value: theirsOrder, preview: describe(theirsOrder) },
          ],
        }, theirsOrder) as string[];
      }
    } else {
      // Both proposals keep every item – they only differ in which side's arrangement comes first.
      const pick = (first: "ours" | "theirs") => regions.flatMap((region) => {
        if ("ok" in region) return region.ok;
        const second = first === "ours" ? "theirs" : "ours";
        return [...new Set([...region.conflict[first], ...region.conflict[second]])];
      });
      const oursOrder = pick("ours");
      const theirsOrder = pick("theirs");
      order = this.decide({
        id: `${path}:order`,
        label: `${label} · Reihenfolge`,
        kind: "order",
        base: hasBase ? describe(alive(baseItems)) : null,
        ours: describe(oursOrder),
        theirs: describe(theirsOrder),
        options: [
          { id: "ours", label: "Deine Reihenfolge", value: oursOrder, preview: describe(oursOrder) },
          { id: "theirs", label: `Reihenfolge von ${this.context.theirsName}`, value: theirsOrder, preview: describe(theirsOrder) },
        ],
      }, theirsOrder) as string[];
    }

    const seen = new Set<string>();
    const result: Item[] = [];
    for (const id of [...order, ...merged.keys()]) {
      const item = merged.get(id);
      if (!item || seen.has(id)) continue;
      seen.add(id);
      result.push(item);
    }
    return result;
  }
}

/**
 * Three-way merge of a document. `base` may be null (unknown common ancestor → every difference is a conflict).
 * Returns the merged document (server state where conflicts remain) and the open conflicts.
 */
export function mergeDocument(spec: DocSpec, base: Item | null, ours: Item, theirs: Item, context: MergeContext): { merged: Item; conflicts: DocConflict[] } {
  const merger = new Merger(context);
  const result: Item = {};
  const keys = new Set([...Object.keys(spec), ...Object.keys(theirs), ...Object.keys(ours)]);
  for (const key of keys) {
    const fieldSpec = spec[key] ?? { kind: "scalar", label: key };
    const value = merger.merge(fieldSpec, key, fieldSpec.label, base?.[key], ours[key], theirs[key], base !== null);
    if (value !== undefined) result[key] = value;
  }
  return { merged: result, conflicts: merger.conflicts };
}

/** Resolves every conflict in favour of "ours" (used when a client rebases its own unsaved edits). */
export function mergePreferOurs(spec: DocSpec, base: Item | null, ours: Item, theirs: Item, context: MergeContext): Item {
  const first = mergeDocument(spec, base, ours, theirs, context);
  if (first.conflicts.length === 0) return first.merged;
  const choices: Record<string, Choice> = {};
  for (const conflict of first.conflicts) {
    const option = conflict.options.find((entry) => entry.id === "ours" || entry.id === "keep") ?? conflict.options[0];
    choices[conflict.id] = { option: option.id };
  }
  return mergeDocument(spec, base, ours, theirs, { ...context, choices }).merged;
}
