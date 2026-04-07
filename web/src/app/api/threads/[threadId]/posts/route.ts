import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertThreadAccess, requireAuthUser } from "@/lib/auth";

const addPostSchema = z.object({
  body: z.string().min(1).max(5000),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ threadId: string }> },
) {
  try {
    const session = await requireAuthUser(request);
    const { threadId } = await context.params;
    await assertThreadAccess(session.userId, threadId);
    const payload = addPostSchema.parse(await request.json());

    const post = await prisma.discussionPost.create({
      data: {
        threadId,
        body: payload.body,
      },
    });

    return NextResponse.json({ post }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to add post." },
      { status: 400 },
    );
  }
}
