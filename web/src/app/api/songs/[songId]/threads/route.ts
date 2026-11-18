import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertSongAccess, requireAuthUser, writeAuditLog } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse, json } from "@/lib/http";
import { notifyBandMembers } from "@/lib/notifications";

const createThreadSchema = z.object({
  title: z.string().trim().min(1, "Bitte ein Thema angeben.").max(200),
  body: z.string().trim().min(1, "Bitte eine Nachricht schreiben.").max(5000),
});

const authorSelect = { select: { id: true, displayName: true, email: true, avatarUrl: true } } as const;

export async function POST(request: NextRequest, context: { params: Promise<{ songId: string }> }) {
  try {
    const session = await requireAuthUser(request);
    const songId = parseUuid((await context.params).songId, "Song-ID");
    const { bandId } = await assertSongAccess(session.userId, songId);
    const payload = createThreadSchema.parse(await request.json());

    const thread = await prisma.discussionThread.create({
      data: {
        songId,
        targetType: "song",
        title: payload.title,
        createdByUserId: session.userId,
        posts: { create: { body: payload.body, createdByUserId: session.userId } },
      },
      include: {
        createdBy: authorSelect,
        posts: { orderBy: { createdAt: "asc" }, include: { createdBy: authorSelect } },
        song: { select: { title: true } },
      },
    });

    await writeAuditLog({
      bandId,
      actorUserId: session.userId,
      action: "thread_created",
      entityType: "song",
      entityId: songId,
      payload: { songId, title: payload.title },
    });

    await notifyBandMembers({
      bandId,
      actorUserId: session.userId,
      kind: "song",
      type: "thread_created",
      title: `Neue Diskussion: ${thread.song.title}`,
      body: payload.title,
      payload: { songId },
    });

    return json({ thread }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Diskussion konnte nicht erstellt werden.");
  }
}
