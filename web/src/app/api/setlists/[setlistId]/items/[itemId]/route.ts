import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AuthError, assertSetlistAccess, requireAuthUser } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse, json } from "@/lib/http";
import { conflictBody, saveDocument, setlistItemKey, type DocState } from "@/lib/merge/server";

const patchSchema = z.object({
  transitionNotes: z.string().max(500).nullable().optional(),
  customKeySignature: z.string().trim().max(20).nullable().optional(),
  baseRevision: z.number().int().positive().nullable().optional(),
});

/** Per-song settings inside a setlist (transition notes, alternative key) – merged with concurrent changes. */
export async function PATCH(request: NextRequest, context: { params: Promise<{ setlistId: string; itemId: string }> }) {
  try {
    const session = await requireAuthUser(request);
    const params = await context.params;
    const setlistId = parseUuid(params.setlistId, "Setlist-ID");
    const itemId = parseUuid(params.itemId, "Eintrags-ID");
    await assertSetlistAccess(session.userId, setlistId);
    const payload = patchSchema.parse(await request.json());

    const items = await prisma.setlistItem.findMany({ where: { setlistId }, orderBy: { position: "asc" }, select: { id: true, songId: true } });
    const index = items.findIndex((item) => item.id === itemId);
    if (index < 0) {
      throw new AuthError("Eintrag nicht gefunden.", 404);
    }
    const key = setlistItemKey(items.map((item) => item.songId), index);

    const merge = await saveDocument({
      docType: "setlist",
      docId: setlistId,
      userId: session.userId,
      baseRevision: payload.baseRevision,
      mutate: (state) => ({
        ...state,
        items: ((state.items as DocState[] | undefined) ?? []).map((item) => (item.id !== key ? item : {
          ...item,
          ...(payload.transitionNotes !== undefined ? { transitionNotes: payload.transitionNotes?.trim() || null } : {}),
          ...(payload.customKeySignature !== undefined ? { customKeySignature: payload.customKeySignature || null } : {}),
        })),
      }),
    });
    if (merge.status === "conflict") return NextResponse.json(conflictBody(merge), { status: 409 });

    const updated = await prisma.setlistItem.findFirst({ where: { setlistId, songId: items[index].songId }, orderBy: { position: "asc" } });
    return json({ item: updated, revision: merge.revision, merge: { status: merge.status } });
  } catch (error) {
    return errorResponse(error, "Eintrag konnte nicht gespeichert werden.");
  }
}
