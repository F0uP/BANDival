import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AuthError, requireAuthUser } from "@/lib/auth";

const querySchema = z.object({
  unreadOnly: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const patchSchema = z.object({
  notificationId: z.string().uuid().optional(),
  markAllRead: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const parsed = querySchema.parse({
      unreadOnly: request.nextUrl.searchParams.get("unreadOnly") ?? undefined,
      limit: request.nextUrl.searchParams.get("limit") ?? undefined,
    });

    const notifications = await prisma.notification.findMany({
      where: {
        userId: session.userId,
        ...(parsed.unreadOnly ? { readAt: null } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: parsed.limit,
    });

    return NextResponse.json({ notifications });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load notifications." },
      { status: 400 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const payload = patchSchema.parse(await request.json());

    if (payload.markAllRead) {
      await prisma.notification.updateMany({
        where: { userId: session.userId, readAt: null },
        data: { readAt: new Date() },
      });

      return NextResponse.json({ ok: true });
    }

    if (!payload.notificationId) {
      throw new AuthError("notificationId is required when markAllRead is false.", 400);
    }

    await prisma.notification.updateMany({
      where: {
        id: payload.notificationId,
        userId: session.userId,
      },
      data: { readAt: new Date() },
    });

    return NextResponse.json({ ok: true, notificationId: payload.notificationId });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update notifications." },
      { status: 400 },
    );
  }
}
