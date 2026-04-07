import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertSetlistAccess, requireAuthUser, writeAuditLog } from "@/lib/auth";

const reorderSchema = z.object({
  orderedItemIds: z.array(z.string().uuid()).min(1),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ setlistId: string }> },
) {
  try {
    const session = await requireAuthUser(request);
    const { setlistId } = await context.params;
    await assertSetlistAccess(session.userId, setlistId);
    const payload = reorderSchema.parse(await request.json());

    const before = await prisma.setlistItem.findMany({
      where: { setlistId },
      orderBy: { position: "asc" },
      select: { id: true, position: true },
    });

    await prisma.$transaction(
      payload.orderedItemIds.map((itemId, index) =>
        prisma.setlistItem.update({
          where: { id: itemId },
          data: { position: index + 1 },
        }),
      ),
    );

    const setlist = await prisma.setlist.findUnique({
      where: { id: setlistId },
      include: {
        items: {
          orderBy: { position: "asc" },
          include: { song: true },
        },
      },
    });

    if (setlist) {
      await writeAuditLog({
        bandId: setlist.bandId,
        actorUserId: session.userId,
        action: "setlist_reordered",
        entityType: "setlist",
        entityId: setlistId,
        payload: {
          before,
          after: payload.orderedItemIds.map((id, index) => ({ id, position: index + 1 })),
        },
      });
    }

    return NextResponse.json({ setlist });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to reorder setlist." },
      { status: 400 },
    );
  }
}
