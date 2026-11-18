import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AuthError, assertSetlistAccess, assertSongsInBand, requireAuthUser, requireBandAction, writeAuditLog } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse, json } from "@/lib/http";
import { loadSetlist, normalizeTags } from "@/lib/setlists";
import { conflictBody, currentRevision, saveDocument, setlistItemKey, type DocState } from "@/lib/merge/server";

const itemSchema = z.object({
  songId: z.string().uuid(),
  transitionNotes: z.string().max(500).nullable().optional(),
});

const updateSetlistSchema = z.object({
  name: z.string().trim().min(1, "Der Name darf nicht leer sein.").max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  instruments: z.array(z.string().max(80)).max(40).optional(),
  equipment: z.array(z.string().max(80)).max(40).optional(),
  /** Full replacement of the song list (keeps transition notes of songs that stay). */
  songIds: z.array(z.string().uuid()).max(200).optional(),
  items: z.array(itemSchema).max(200).optional(),
  /** Revision the client started from – order, notes and songs are merged with changes of others. */
  baseRevision: z.number().int().positive().nullable().optional(),
});

type Context = { params: Promise<{ setlistId: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const setlistId = parseUuid((await context.params).setlistId, "Setlist-ID");
    await assertSetlistAccess(session.userId, setlistId, { allowGuest: true });
    const setlist = await loadSetlist(setlistId);
    if (!setlist) {
      throw new AuthError("Setlist nicht gefunden.", 404);
    }
    return json({ setlist: { ...setlist, revision: await currentRevision("setlist", setlistId) } });
  } catch (error) {
    return errorResponse(error, "Setlist konnte nicht geladen werden.");
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const setlistId = parseUuid((await context.params).setlistId, "Setlist-ID");
    const { bandId } = await assertSetlistAccess(session.userId, setlistId);
    const payload = updateSetlistSchema.parse(await request.json());

    const nextItems = payload.items ?? payload.songIds?.map((songId) => ({ songId, transitionNotes: undefined }));
    if (nextItems) {
      await assertSongsInBand(bandId, nextItems.map((item) => item.songId));
    }

    const merge = await saveDocument({
      docType: "setlist",
      docId: setlistId,
      userId: session.userId,
      baseRevision: payload.baseRevision,
      mutate: (state) => {
        const next: DocState = { ...state };
        if (payload.name !== undefined) next.name = payload.name;
        if (payload.description !== undefined) next.description = payload.description?.trim() || null;
        if (payload.instruments) next.instruments = normalizeTags(payload.instruments);
        if (payload.equipment) next.equipment = normalizeTags(payload.equipment);
        if (nextItems) {
          // Songs that stay keep their notes and setlist-specific key/tempo.
          const previous = new Map<string, DocState>();
          for (const item of (state.items as DocState[] | undefined) ?? []) {
            if (!previous.has(String(item.songId))) previous.set(String(item.songId), item);
          }
          const songIds = nextItems.map((item) => item.songId);
          next.items = nextItems.map((item, index) => {
            const before = previous.get(item.songId);
            return {
              id: setlistItemKey(songIds, index),
              songId: item.songId,
              transitionNotes: item.transitionNotes === undefined ? before?.transitionNotes ?? null : item.transitionNotes?.trim() || null,
              customKeySignature: before?.customKeySignature ?? null,
              customTempoBpm: before?.customTempoBpm ?? null,
              customDurationSeconds: before?.customDurationSeconds ?? null,
            };
          });
        }
        return next;
      },
    });
    if (merge.status === "conflict") return NextResponse.json(conflictBody(merge), { status: 409 });

    const setlist = await loadSetlist(setlistId);

    await writeAuditLog({
      bandId,
      actorUserId: session.userId,
      action: "setlist_updated",
      entityType: "setlist",
      entityId: setlistId,
      payload: {
        setlistId,
        name: setlist?.name ?? null,
        changedSongs: nextItems !== undefined,
      },
    });

    return json({ setlist: setlist ? { ...setlist, revision: merge.revision } : null, merge: { status: merge.status } });
  } catch (error) {
    return errorResponse(error, "Setlist konnte nicht gespeichert werden.");
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const setlistId = parseUuid((await context.params).setlistId, "Setlist-ID");
    const { bandId } = await assertSetlistAccess(session.userId, setlistId);
    await requireBandAction(session.userId, bandId, "setlists.delete");

    const existing = await prisma.setlist.findUnique({ where: { id: setlistId }, select: { id: true, name: true } });
    if (!existing) {
      throw new AuthError("Setlist nicht gefunden.", 404);
    }

    await prisma.setlist.delete({ where: { id: setlistId } });

    await writeAuditLog({
      bandId,
      actorUserId: session.userId,
      action: "setlist_deleted",
      entityType: "setlist",
      entityId: existing.id,
      payload: { name: existing.name },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Setlist konnte nicht gelöscht werden.");
  }
}
