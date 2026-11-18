import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AuthError, requireAuthUser } from "@/lib/auth";
import { errorResponse } from "@/lib/http";

const querySchema = z.object({
  unreadOnly: z.enum(["true", "false"]).optional(),
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

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: session.userId, ...(parsed.unreadOnly === "true" ? { readAt: null } : {}) },
        orderBy: { createdAt: "desc" },
        take: parsed.limit,
      }),
      prisma.notification.count({ where: { userId: session.userId, readAt: null } }),
    ]);

    return NextResponse.json({ notifications, unreadCount });
  } catch (error) {
    return errorResponse(error, "Benachrichtigungen konnten nicht geladen werden.");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const payload = patchSchema.parse(await request.json());

    if (payload.markAllRead) {
      await prisma.notification.updateMany({ where: { userId: session.userId, readAt: null }, data: { readAt: new Date() } });
      return NextResponse.json({ ok: true });
    }

    if (!payload.notificationId) {
      throw new AuthError("notificationId fehlt.", 400);
    }

    await prisma.notification.updateMany({
      where: { id: payload.notificationId, userId: session.userId, readAt: null },
      data: { readAt: new Date() },
    });

    return NextResponse.json({ ok: true, notificationId: payload.notificationId });
  } catch (error) {
    return errorResponse(error);
  }
}
