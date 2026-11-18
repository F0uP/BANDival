import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuthUser } from "@/lib/auth";
import { errorResponse } from "@/lib/http";

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2000).refine((value) => value.startsWith("https://"), "Ungültiger Push-Endpunkt."),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(4).max(100) }),
});

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const { endpoint, keys } = subscriptionSchema.parse(await request.json());
    const userAgent = request.headers.get("user-agent")?.slice(0, 300) ?? null;
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { userId: session.userId, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent },
      update: { userId: session.userId, p256dh: keys.p256dh, auth: keys.auth, userAgent },
    });
    const devices = await prisma.pushSubscription.count({ where: { userId: session.userId } });
    return NextResponse.json({ ok: true, devices });
  } catch (error) {
    return errorResponse(error, "Push konnte nicht aktiviert werden.");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const body = (await request.json().catch(() => ({}))) as { endpoint?: unknown };
    if (typeof body.endpoint === "string") {
      await prisma.pushSubscription.deleteMany({ where: { userId: session.userId, endpoint: body.endpoint } });
    } else {
      await prisma.pushSubscription.deleteMany({ where: { userId: session.userId } });
    }
    const devices = await prisma.pushSubscription.count({ where: { userId: session.userId } });
    return NextResponse.json({ ok: true, devices });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const devices = await prisma.pushSubscription.count({ where: { userId: session.userId } });
    return NextResponse.json({ devices });
  } catch (error) {
    return errorResponse(error);
  }
}
