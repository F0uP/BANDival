import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertSongAccess, requireAuthUser } from "@/lib/auth";

const createThreadSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ songId: string }> },
) {
  try {
    const session = await requireAuthUser(request);
    const { songId } = await context.params;
    await assertSongAccess(session.userId, songId);
    const payload = createThreadSchema.parse(await request.json());

    let thread;
    try {
      thread = await prisma.discussionThread.create({
        data: {
          songId,
          createdByUserId: session.userId,
          targetType: "song",
          title: payload.title,
          posts: {
            create: {
              body: payload.body,
              createdByUserId: session.userId,
            },
          },
        },
        include: {
          createdBy: {
            select: {
              id: true,
              email: true,
              displayName: true,
              avatarUrl: true,
            },
          },
          posts: {
            include: {
              createdBy: {
                select: {
                  id: true,
                  email: true,
                  displayName: true,
                  avatarUrl: true,
                },
              },
            },
            orderBy: { createdAt: "asc" },
          },
        },
      });
    } catch {
      thread = await prisma.discussionThread.create({
        data: {
          songId,
          targetType: "song",
          title: payload.title,
          posts: {
            create: {
              body: payload.body,
            },
          },
        },
        include: {
          posts: {
            orderBy: { createdAt: "asc" },
          },
        },
      });
    }

    return NextResponse.json({ thread }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create thread." },
      { status: 400 },
    );
  }
}
