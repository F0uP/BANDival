import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AuthError, assertSetlistAccess, requireAuthUser, writeAuditLog } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse, json } from "@/lib/http";
import { applySetlistOrder, loadSetlist } from "@/lib/setlists";

const reorderSchema = z.object({
  orderedItemIds: z.array(z.string().uuid()).min(1).max(200),
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ setlistId: string }> }) {
  try {
    const session = await requireAuthUser(request);
    const setlistId = parseUuid((await context.params).setlistId, "Setlist-ID");
    const { bandId } = await assertSetlistAccess(session.userId, setlistId);
    const payload = reorderSchema.parse(await request.json());

    const items = await prisma.setlistItem.findMany({ where: { setlistId }, select: { id: true } });
    const ownIds = new Set(items.map((item) => item.id));
    const requested = new Set(payload.orderedItemIds);
    if (requested.size !== payload.orderedItemIds.length || requested.size !== ownIds.size || payload.orderedItemIds.some((id) => !ownIds.has(id))) {
      throw new AuthError("Die Reihenfolge passt nicht zur aktuellen Setlist. Bitte neu laden.", 409);
    }

    await prisma.$transaction(async (tx) => {
      await applySetlistOrder(tx, setlistId, payload.orderedItemIds);
      await tx.setlist.update({ where: { id: setlistId }, data: { updatedAt: new Date() } });
    });

    const setlist = await loadSetlist(setlistId);

    await writeAuditLog({
      bandId,
      actorUserId: session.userId,
      action: "setlist_reordered",
      entityType: "setlist",
      entityId: setlistId,
      payload: { setlistId, name: setlist?.name ?? null },
    });

    return json({ setlist });
  } catch (error) {
    return errorResponse(error, "Reihenfolge konnte nicht gespeichert werden.");
  }
}
