import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AuthError, assertSetlistAccess, requireAuthUser, writeAuditLog } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse } from "@/lib/http";

const patchSchema = z.object({
  songId: z.string().uuid(),
  note: z.string().max(5000),
});

type Context = { params: Promise<{ setlistId: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const setlistId = parseUuid((await context.params).setlistId, "Setlist-ID");
    await assertSetlistAccess(session.userId, setlistId);

    const [items, notes] = await Promise.all([
      prisma.setlistItem.findMany({
        where: { setlistId },
        orderBy: { position: "asc" },
        select: { songId: true, position: true, song: { select: { title: true } } },
      }),
      prisma.setlistRehearsalNote.findMany({
        where: { setlistId },
        select: {
          songId: true,
          note: true,
          updatedAt: true,
          updatedBy: { select: { displayName: true } },
        },
      }),
    ]);

    return NextResponse.json({ items, notes });
  } catch (error) {
    return errorResponse(error, "Probennotizen konnten nicht geladen werden.");
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const setlistId = parseUuid((await context.params).setlistId, "Setlist-ID");
    const { bandId } = await assertSetlistAccess(session.userId, setlistId);
    const payload = patchSchema.parse(await request.json());

    const link = await prisma.setlistItem.findFirst({ where: { setlistId, songId: payload.songId }, select: { id: true } });
    if (!link) {
      throw new AuthError("Der Song ist nicht Teil dieser Setlist.", 404);
    }

    const note = await prisma.setlistRehearsalNote.upsert({
      where: { setlistId_songId: { setlistId, songId: payload.songId } },
      create: { setlistId, songId: payload.songId, note: payload.note, updatedByUserId: session.userId },
      update: { note: payload.note, updatedByUserId: session.userId },
      select: { songId: true, note: true, updatedAt: true, updatedBy: { select: { displayName: true } } },
    });

    await writeAuditLog({
      bandId,
      actorUserId: session.userId,
      action: "rehearsal_note_updated",
      entityType: "setlist",
      entityId: setlistId,
      payload: { songId: payload.songId, setlistId },
    });

    return NextResponse.json({ note });
  } catch (error) {
    return errorResponse(error, "Probennotiz konnte nicht gespeichert werden.");
  }
}
