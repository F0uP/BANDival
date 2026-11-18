import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthError, assertSetlistAccess, requireAuthUser, requireBandAction, writeAuditLog } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse, json } from "@/lib/http";
import { setlistDetailInclude } from "@/lib/schemas";
import { decodeLegacyDescription, presentSetlist } from "@/lib/setlists";

export async function POST(request: NextRequest, context: { params: Promise<{ setlistId: string }> }) {
  try {
    const session = await requireAuthUser(request);
    const setlistId = parseUuid((await context.params).setlistId, "Setlist-ID");
    const { bandId } = await assertSetlistAccess(session.userId, setlistId);
    await requireBandAction(session.userId, bandId, "setlists.create");

    const original = await prisma.setlist.findUnique({
      where: { id: setlistId },
      include: { items: { orderBy: { position: "asc" } } },
    });
    if (!original) {
      throw new AuthError("Setlist nicht gefunden.", 404);
    }
    const legacy = decodeLegacyDescription(original.description);

    const copied = await prisma.setlist.create({
      data: {
        bandId: original.bandId,
        name: `${original.name} (Kopie)`.slice(0, 200),
        description: legacy.description,
        instruments: original.instruments.length > 0 ? original.instruments : legacy.instruments,
        equipment: original.equipment.length > 0 ? original.equipment : legacy.equipment,
        copiedFromSetlistId: original.id,
        coverImageUrl: original.coverImageUrl,
        items: {
          create: original.items.map((item, index) => ({
            songId: item.songId,
            position: index + 1,
            transitionNotes: item.transitionNotes,
            customKeySignature: item.customKeySignature,
            customTempoBpm: item.customTempoBpm,
            customDurationSeconds: item.customDurationSeconds,
          })),
        },
      },
      include: setlistDetailInclude,
    });

    await writeAuditLog({
      bandId,
      actorUserId: session.userId,
      action: "setlist_copied",
      entityType: "setlist",
      entityId: copied.id,
      payload: { sourceSetlistId: original.id, name: copied.name, setlistId: copied.id },
    });

    return json({ setlist: presentSetlist(copied) }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Setlist konnte nicht kopiert werden.");
  }
}
