import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertThreadAccess, requireAuthUser } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse, json } from "@/lib/http";
import { notifyBandMembers } from "@/lib/notifications";

const addPostSchema = z.object({
  body: z.string().trim().min(1, "Bitte eine Nachricht schreiben.").max(5000),
});

export async function POST(request: NextRequest, context: { params: Promise<{ threadId: string }> }) {
  try {
    const session = await requireAuthUser(request);
    const threadId = parseUuid((await context.params).threadId, "Diskussions-ID");
    const { bandId, songId } = await assertThreadAccess(session.userId, threadId);
    const payload = addPostSchema.parse(await request.json());

    const [post, thread] = await prisma.$transaction([
      prisma.discussionPost.create({
        data: { threadId, body: payload.body, createdByUserId: session.userId },
        include: { createdBy: { select: { id: true, displayName: true, email: true, avatarUrl: true } } },
      }),
      prisma.discussionThread.update({
        where: { id: threadId },
        data: { updatedAt: new Date() },
        select: { title: true, song: { select: { title: true } } },
      }),
    ]);

    await notifyBandMembers({
      bandId,
      actorUserId: session.userId,
      kind: "song",
      type: "thread_reply",
      title: `Antwort in „${thread.title}“`,
      body: `${post.createdBy?.displayName ?? "Jemand"} (${thread.song.title}): ${payload.body.slice(0, 160)}`,
      payload: { songId },
    });

    return json({ post }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Antwort konnte nicht gespeichert werden.");
  }
}
