import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertSetlistAccess, requireAuthUser, writeAuditLog } from "@/lib/auth";

const updateSetlistSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  songIds: z.array(z.string().uuid()).optional(),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ setlistId: string }> },
) {
  try {
    const session = await requireAuthUser(request);
    const { setlistId } = await context.params;
    await assertSetlistAccess(session.userId, setlistId);
    const payload = updateSetlistSchema.parse(await request.json());

    const existing = await prisma.setlist.findUnique({
      where: { id: setlistId },
      include: { items: { orderBy: { position: "asc" } } },
    });

    if (!existing) {
      return NextResponse.json({ error: "Setlist not found." }, { status: 404 });
    }

    const setlist = await prisma.$transaction(async (tx) => {
      const updated = await tx.setlist.update({
        where: { id: setlistId },
        data: {
          name: payload.name,
          description: payload.description,
        },
      });

      if (payload.songIds) {
        await tx.setlistItem.deleteMany({ where: { setlistId } });
        if (payload.songIds.length > 0) {
          await tx.setlistItem.createMany({
            data: payload.songIds.map((songId, index) => ({
              setlistId,
              songId,
              position: index + 1,
            })),
          });
        }
      }

      return tx.setlist.findUnique({
        where: { id: updated.id },
        include: {
          items: {
            orderBy: { position: "asc" },
            include: { song: true },
          },
        },
      });
    });

    await writeAuditLog({
      bandId: existing.bandId,
      actorUserId: session.userId,
      action: "setlist_updated",
      entityType: "setlist",
      entityId: existing.id,
      payload: {
        changedName: payload.name !== undefined,
        changedDescription: payload.description !== undefined,
        changedSongs: payload.songIds !== undefined,
      },
    });

    return NextResponse.json({ setlist });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update setlist." },
      { status: 400 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ setlistId: string }> },
) {
  try {
    const session = await requireAuthUser(request);
    const { setlistId } = await context.params;
    await assertSetlistAccess(session.userId, setlistId);

    const existing = await prisma.setlist.findUnique({
      where: { id: setlistId },
      select: { id: true, bandId: true, name: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Setlist not found." }, { status: 404 });
    }

    await prisma.setlist.delete({ where: { id: setlistId } });

    await writeAuditLog({
      bandId: existing.bandId,
      actorUserId: session.userId,
      action: "setlist_deleted",
      entityType: "setlist",
      entityId: existing.id,
      payload: { name: existing.name },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete setlist." },
      { status: 400 },
    );
  }
}
