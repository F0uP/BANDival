import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertSetlistAccess, AuthError, requireAuthUser, writeAuditLog } from "@/lib/auth";

const patchSchema = z.object({
  songId: z.string().uuid(),
  note: z.string().max(5000),
});

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ setlistId: string }> },
) {
  try {
    const session = await requireAuthUser(request);
    const { setlistId } = await context.params;
    await assertSetlistAccess(session.userId, setlistId);

    const [items, notes, tasks] = await Promise.all([
      prisma.setlistItem.findMany({
        where: { setlistId },
        orderBy: { position: "asc" },
        select: {
          songId: true,
          position: true,
          song: {
            select: {
              title: true,
            },
          },
        },
      }),
      prisma.setlistRehearsalNote.findMany({
        where: { setlistId },
        select: {
          songId: true,
          note: true,
          updatedAt: true,
        },
      }),
      prisma.setlistRehearsalTask.findMany({
        where: { setlistId },
        include: {
          assignee: {
            select: {
              id: true,
              displayName: true,
              email: true,
            },
          },
        },
        orderBy: [{ isDone: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
      }),
    ]);

    return NextResponse.json({ items, notes, tasks });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load rehearsal notes." },
      { status: 400 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ setlistId: string }> },
) {
  try {
    const session = await requireAuthUser(request);
    const { setlistId } = await context.params;
    await assertSetlistAccess(session.userId, setlistId);

    const payload = patchSchema.parse(await request.json());

    const link = await prisma.setlistItem.findFirst({
      where: { setlistId, songId: payload.songId },
      select: { id: true },
    });

    if (!link) {
      throw new AuthError("Song is not part of this setlist.", 404);
    }

    const note = await prisma.setlistRehearsalNote.upsert({
      where: {
        setlistId_songId: {
          setlistId,
          songId: payload.songId,
        },
      },
      create: {
        setlistId,
        songId: payload.songId,
        note: payload.note,
        updatedByUserId: session.userId,
      },
      update: {
        note: payload.note,
        updatedByUserId: session.userId,
      },
    });

    const setlist = await prisma.setlist.findUnique({ where: { id: setlistId }, select: { bandId: true } });
    if (setlist) {
      await writeAuditLog({
        bandId: setlist.bandId,
        actorUserId: session.userId,
        action: "rehearsal_note_updated",
        entityType: "setlist",
        entityId: setlistId,
        payload: { songId: payload.songId },
      });
    }

    return NextResponse.json({ note });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save rehearsal note." },
      { status: 400 },
    );
  }
}
