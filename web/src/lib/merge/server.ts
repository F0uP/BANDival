import { Prisma, type SongVisibility, type SongWorkflowStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { AuthError } from "@/lib/auth";
import { HttpError } from "@/lib/http";
import { deliver } from "@/lib/notifications";
import { mergeDocument, stableStringify, type Choice, type DocConflict } from "@/lib/merge/document";
import { DOC_LABEL, DOC_SPECS, type DocType } from "@/lib/merge/specs";
import { sanitizeScore } from "@/lib/notation/model";

/*
 * Git-like saving: every change is based on a revision. If someone else saved in between,
 * base / ours / theirs are merged three-way; what cannot be merged becomes a MergeConflict
 * the author resolves later (with a push notification pointing to it).
 */

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;
export type DocState = Record<string, unknown>;
type Loaded = { bandId: string; title: string; url: string; state: DocState; labels?: Record<string, string> };

/** Revisions kept per document – older ones are pruned (conflicts store their own copies). */
const KEEP_REVISIONS = 200;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function int(value: unknown): number | null {
  const number = typeof value === "number" ? value : value === null || value === undefined || value === "" ? NaN : Number(value);
  return Number.isFinite(number) ? Math.round(number) : null;
}

function decimal(value: unknown): number | null {
  const number = typeof value === "number" ? value : value === null || value === undefined || value === "" ? NaN : Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Setlist entries are keyed by song id (a second occurrence of the same song gets "~2", …). */
function setlistKeys(songIds: string[]): string[] {
  const seen = new Map<string, number>();
  return songIds.map((songId) => {
    const count = (seen.get(songId) ?? 0) + 1;
    seen.set(songId, count);
    return count === 1 ? songId : `${songId}~${count}`;
  });
}

type Adapter = {
  load(db: Db, id: string): Promise<Loaded | null>;
  apply(tx: Tx, id: string, state: DocState, userId: string): Promise<void>;
};

const ADAPTERS: Record<DocType, Adapter> = {
  song: {
    async load(db, id) {
      const song = await db.song.findUnique({
        where: { id },
        select: {
          bandId: true, title: true, workflowStatus: true, keySignature: true, tempoBpm: true, durationSeconds: true, timeSignature: true,
          isPublic: true, spotifyUrl: true, visibility: true, notes: true, chordProText: true,
          composers: true, lyricists: true, publisher: true, gemaWorkNumber: true,
        },
      });
      if (!song) return null;
      const { bandId, ...state } = song;
      return { bandId, title: song.title, url: `/app/songs/${id}`, state: { ...state, tempoBpm: song.tempoBpm === null ? null : Number(song.tempoBpm) } };
    },
    async apply(tx, id, state) {
      await tx.song.update({
        where: { id },
        data: {
          title: text(state.title)?.trim().slice(0, 200) ?? "Ohne Titel",
          workflowStatus: state.workflowStatus as SongWorkflowStatus,
          keySignature: text(state.keySignature),
          tempoBpm: decimal(state.tempoBpm),
          durationSeconds: int(state.durationSeconds),
          timeSignature: text(state.timeSignature),
          isPublic: Boolean(state.isPublic),
          spotifyUrl: text(state.spotifyUrl),
          visibility: state.visibility as SongVisibility,
          notes: text(state.notes),
          chordProText: text(state.chordProText),
          composers: text(state.composers),
          lyricists: text(state.lyricists),
          publisher: text(state.publisher),
          gemaWorkNumber: text(state.gemaWorkNumber),
        },
      });
    },
  },
  part: {
    async load(db, id) {
      const part = await db.songPart.findUnique({ where: { id }, select: { songId: true, instrument: true, kind: true, content: true, song: { select: { bandId: true, title: true } } } });
      if (!part) return null;
      return {
        bandId: part.song.bandId,
        title: `${part.instrument} · ${part.song.title}`,
        url: `/app/songs/${part.songId}?tab=parts`,
        state: { kind: part.kind, content: part.content },
      };
    },
    async apply(tx, id, state, userId) {
      await tx.songPart.update({ where: { id }, data: { kind: String(state.kind ?? "chordpro"), content: String(state.content ?? ""), updatedByUserId: userId } });
    },
  },
  score: {
    async load(db, id) {
      const score = await db.songScore.findUnique({ where: { id }, select: { songId: true, title: true, instrument: true, data: true, song: { select: { bandId: true, title: true } } } });
      if (!score) return null;
      return {
        bandId: score.song.bandId,
        title: `${score.title} · ${score.song.title}`,
        url: `/app/songs/${score.songId}/scores/${id}`,
        state: { title: score.title, instrument: score.instrument, data: score.data },
      };
    },
    async apply(tx, id, state) {
      await tx.songScore.update({
        where: { id },
        data: {
          title: text(state.title)?.trim().slice(0, 120) ?? "Noten",
          instrument: text(state.instrument),
          data: sanitizeScore(state.data) as unknown as Prisma.InputJsonValue,
        },
      });
    },
  },
  setlist: {
    async load(db, id) {
      const setlist = await db.setlist.findUnique({
        where: { id },
        select: {
          bandId: true, name: true, description: true, instruments: true, equipment: true,
          items: { orderBy: { position: "asc" }, select: { songId: true, transitionNotes: true, customKeySignature: true, customTempoBpm: true, customDurationSeconds: true, song: { select: { title: true } } } },
        },
      });
      if (!setlist) return null;
      const keys = setlistKeys(setlist.items.map((item) => item.songId));
      const labels: Record<string, string> = {};
      setlist.items.forEach((item, index) => {
        labels[keys[index]] = item.song.title;
        labels[item.songId] = item.song.title;
      });
      return {
        bandId: setlist.bandId,
        title: setlist.name,
        url: `/app/setlists/${id}`,
        labels,
        state: {
          name: setlist.name,
          description: setlist.description,
          instruments: setlist.instruments,
          equipment: setlist.equipment,
          items: setlist.items.map((item, index) => ({
            id: keys[index],
            songId: item.songId,
            transitionNotes: item.transitionNotes,
            customKeySignature: item.customKeySignature,
            customTempoBpm: item.customTempoBpm === null ? null : Number(item.customTempoBpm),
            customDurationSeconds: item.customDurationSeconds,
          })),
        },
      };
    },
    async apply(tx, id, state) {
      const setlist = await tx.setlist.findUniqueOrThrow({ where: { id }, select: { bandId: true } });
      const items = Array.isArray(state.items) ? (state.items as DocState[]) : [];
      const songIds = [...new Set(items.map((item) => String(item.songId)))];
      const valid = new Set((await tx.song.findMany({ where: { id: { in: songIds }, bandId: setlist.bandId }, select: { id: true } })).map((song) => song.id));
      await tx.setlist.update({
        where: { id },
        data: {
          name: text(state.name)?.trim().slice(0, 200) ?? "Setlist",
          description: text(state.description),
          instruments: Array.isArray(state.instruments) ? state.instruments.map(String) : [],
          equipment: Array.isArray(state.equipment) ? state.equipment.map(String) : [],
        },
      });
      await tx.setlistItem.deleteMany({ where: { setlistId: id } });
      const rows = items.filter((item) => valid.has(String(item.songId)));
      if (rows.length) {
        await tx.setlistItem.createMany({
          data: rows.map((item, index) => ({
            setlistId: id,
            songId: String(item.songId),
            position: index + 1,
            transitionNotes: text(item.transitionNotes),
            customKeySignature: text(item.customKeySignature),
            customTempoBpm: decimal(item.customTempoBpm),
            customDurationSeconds: int(item.customDurationSeconds),
          })),
        });
      }
    },
  },
};

export function setlistItemKey(songIds: string[], index: number): string {
  return setlistKeys(songIds)[index];
}

/** Latest revision of a document; external changes (paths that bypass the merge) get a revision on the fly. */
async function headRevision(tx: Tx, docType: DocType, docId: string, loaded: Loaded): Promise<{ revision: number; authorId: string | null }> {
  const latest = await tx.docRevision.findFirst({ where: { docType, docId }, orderBy: { revision: "desc" }, select: { revision: true, data: true, authorId: true } });
  if (latest && stableStringify(latest.data) === stableStringify(loaded.state)) return { revision: latest.revision, authorId: latest.authorId };
  const revision = (latest?.revision ?? 0) + 1;
  await tx.docRevision.create({ data: { bandId: loaded.bandId, docType, docId, revision, data: loaded.state as Prisma.InputJsonValue, authorId: null } });
  return { revision, authorId: null };
}

async function lockDocument(tx: Tx, docType: DocType, docId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${docType}:${docId}`}))`;
}

/** Revision to hand to clients together with a document (they send it back as `baseRevision`). */
export async function currentRevision(docType: DocType, docId: string): Promise<number> {
  return prisma.$transaction(async (tx) => {
    await lockDocument(tx, docType, docId);
    const loaded = await ADAPTERS[docType].load(tx, docId);
    if (!loaded) return 0;
    return (await headRevision(tx, docType, docId, loaded)).revision;
  }, { timeout: 20_000, maxWait: 10_000 });
}

export type SaveOutcome =
  | { status: "saved" | "merged"; revision: number; state: DocState }
  | { status: "conflict"; conflictId: string; labels: string[]; revision: number };

async function displayName(db: Db, userId: string | null, selfId: string): Promise<string> {
  if (!userId) return "jemand anderem";
  if (userId === selfId) return "deinem anderen Gerät";
  // Must use the transaction client: a second connection would wait for the lock held by this transaction.
  const user = await db.appUser.findUnique({ where: { id: userId }, select: { displayName: true } });
  return user?.displayName.split(" ")[0] ?? "jemand anderem";
}

/**
 * Saves a change. `mutate` describes the change relative to the state the client saw (its base revision).
 * Without a known base the change is applied to the current state (fast-forward).
 */
export async function saveDocument(args: {
  docType: DocType;
  docId: string;
  userId: string;
  baseRevision?: number | null;
  mutate: (state: DocState) => DocState;
}): Promise<SaveOutcome> {
  const adapter = ADAPTERS[args.docType];
  const outcome = await prisma.$transaction(async (tx) => {
    await lockDocument(tx, args.docType, args.docId);
    const loaded = await adapter.load(tx, args.docId);
    if (!loaded) throw new AuthError(`${DOC_LABEL[args.docType]} nicht gefunden.`, 404);
    const head = await headRevision(tx, args.docType, args.docId, loaded);
    const baseRow = args.baseRevision && args.baseRevision !== head.revision
      ? await tx.docRevision.findUnique({ where: { docType_docId_revision: { docType: args.docType, docId: args.docId, revision: args.baseRevision } }, select: { data: true } })
      : null;

    const commit = async (next: DocState, status: "saved" | "merged"): Promise<SaveOutcome> => {
      if (stableStringify(next) === stableStringify(loaded.state)) return { status, revision: head.revision, state: loaded.state };
      await adapter.apply(tx, args.docId, next, args.userId);
      const reloaded = await adapter.load(tx, args.docId);
      const state = reloaded?.state ?? next;
      const revision = head.revision + 1;
      await tx.docRevision.create({ data: { bandId: loaded.bandId, docType: args.docType, docId: args.docId, revision, data: state as Prisma.InputJsonValue, authorId: args.userId } });
      if (revision > KEEP_REVISIONS) {
        await tx.docRevision.deleteMany({ where: { docType: args.docType, docId: args.docId, revision: { lt: revision - KEEP_REVISIONS } } });
      }
      return { status, revision, state };
    };

    // Fast-forward: nobody saved in between (or the base is unknown / pruned).
    if (!baseRow) return { outcome: await commit(args.mutate(structuredClone(loaded.state)), "saved"), loaded };

    const base = baseRow.data as DocState;
    const ours = args.mutate(structuredClone(base));
    const theirsName = await displayName(tx, head.authorId, args.userId);
    const merge = mergeDocument(DOC_SPECS[args.docType], base, ours, loaded.state, { theirsName, labels: loaded.labels });
    if (merge.conflicts.length === 0) return { outcome: await commit(merge.merged, "merged"), loaded };

    const conflict = await tx.mergeConflict.create({
      data: {
        bandId: loaded.bandId,
        userId: args.userId,
        docType: args.docType,
        docId: args.docId,
        docTitle: loaded.title,
        docUrl: loaded.url,
        baseRevision: args.baseRevision ?? 0,
        theirsRevision: head.revision,
        base: base as Prisma.InputJsonValue,
        ours: ours as Prisma.InputJsonValue,
        theirs: loaded.state as Prisma.InputJsonValue,
        theirsName,
        labels: merge.conflicts.map((entry) => entry.label),
      },
      select: { id: true },
    });
    const labels = merge.conflicts.map((entry) => entry.label);
    return { outcome: { status: "conflict" as const, conflictId: conflict.id, labels, revision: head.revision }, loaded };
  }, { timeout: 20_000, maxWait: 10_000 });

  if (outcome.outcome.status === "conflict") {
    const labels = outcome.outcome.labels;
    const where = labels.length > 2 ? `${labels.slice(0, 2).join(", ")} und ${labels.length - 2} weitere Stellen` : labels.join(", ");
    await deliver([args.userId], {
      bandId: outcome.loaded.bandId,
      kind: args.docType === "setlist" ? "setlist" : "song",
      type: "merge_conflict",
      title: `Merge-Konflikt: ${outcome.loaded.title}`,
      body: `${where} – entscheide, wie zusammengeführt wird.`,
      payload: { url: `/app/conflicts/${outcome.outcome.conflictId}`, conflictId: outcome.outcome.conflictId },
    }).catch((error) => console.error("[merge] notification failed", error));
  }
  return outcome.outcome;
}

type ConflictRow = Prisma.MergeConflictGetPayload<object>;

async function ownConflict(conflictId: string, userId: string): Promise<ConflictRow> {
  const conflict = await prisma.mergeConflict.findFirst({ where: { id: conflictId, userId } });
  if (!conflict) throw new AuthError("Konflikt nicht gefunden.", 404);
  return conflict;
}

function recompute(conflict: ConflictRow, labels: Record<string, string> | undefined, choices?: Record<string, Choice>) {
  return mergeDocument(
    DOC_SPECS[conflict.docType as DocType],
    (conflict.base as DocState | null) ?? null,
    conflict.ours as DocState,
    conflict.theirs as DocState,
    { theirsName: conflict.theirsName, labels, choices },
  );
}

/** Conflict with all open decisions and their proposals (computed deterministically from base/ours/theirs). */
export async function conflictView(conflictId: string, userId: string): Promise<{ conflict: Omit<ConflictRow, "base" | "ours" | "theirs">; items: DocConflict[] }> {
  const conflict = await ownConflict(conflictId, userId);
  const loaded = await ADAPTERS[conflict.docType as DocType].load(prisma, conflict.docId);
  const { items } = { items: recompute(conflict, loaded?.labels).conflicts };
  const { base: _base, ours: _ours, theirs: _theirs, ...meta } = conflict;
  void _base;
  void _ours;
  void _theirs;
  return { conflict: meta, items };
}

/** Applies the user's decisions. The result is saved like a normal change on top of the server state at conflict time. */
export async function resolveConflict(conflictId: string, userId: string, choices: Record<string, Choice>): Promise<SaveOutcome> {
  const conflict = await ownConflict(conflictId, userId);
  if (conflict.status !== "open") throw new HttpError("Dieser Konflikt wurde bereits gelöst.", 409);
  const docType = conflict.docType as DocType;
  const loaded = await ADAPTERS[docType].load(prisma, conflict.docId);
  if (!loaded) throw new AuthError(`${DOC_LABEL[docType]} existiert nicht mehr.`, 404);
  const result = recompute(conflict, loaded.labels, choices);
  if (result.conflicts.length > 0) {
    throw new HttpError(`Noch ${result.conflicts.length} ${result.conflicts.length === 1 ? "Stelle" : "Stellen"} offen.`, 400);
  }
  const outcome = await saveDocument({ docType, docId: conflict.docId, userId, baseRevision: conflict.theirsRevision, mutate: () => result.merged });
  await prisma.mergeConflict.update({ where: { id: conflict.id }, data: { status: "resolved", resolvedAt: new Date() } });
  return outcome;
}

export async function discardConflict(conflictId: string, userId: string): Promise<void> {
  const conflict = await ownConflict(conflictId, userId);
  await prisma.mergeConflict.update({ where: { id: conflict.id }, data: { status: "discarded", resolvedAt: new Date() } });
}

/** 409 response body for a change that needs a manual merge. */
export function conflictBody(outcome: Extract<SaveOutcome, { status: "conflict" }>) {
  return {
    error: "Merge-Konflikt: Jemand hat dieselbe Stelle geändert. Entscheide, wie zusammengeführt wird.",
    conflict: { id: outcome.conflictId, labels: outcome.labels },
  };
}
