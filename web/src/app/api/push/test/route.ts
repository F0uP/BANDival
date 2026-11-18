import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertLoginAllowed, registerFailedLogin, requireAuthUser } from "@/lib/auth";
import { HttpError, errorResponse } from "@/lib/http";
import { sendNtfy, sendWebPush } from "@/lib/push";

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    await assertLoginAllowed(`push-test:${session.userId}`, null);
    await registerFailedLogin(`push-test:${session.userId}`, null);
    const user = await prisma.appUser.findUniqueOrThrow({ where: { id: session.userId }, select: { ntfyTopicUrl: true } });
    const message = { title: "Bandival – Test", body: "Push-Benachrichtigungen funktionieren 🎸", url: "/app/settings", tag: "test" };
    const [push, ntfy] = await Promise.all([
      sendWebPush([session.userId], message),
      user.ntfyTopicUrl ? sendNtfy(user.ntfyTopicUrl, message) : Promise.resolve(false),
    ]);
    if (push === 0 && !ntfy) {
      throw new HttpError("Kein Gerät erreicht. Aktiviere Push in diesem Browser oder hinterlege ein ntfy-Topic.", 400);
    }
    return NextResponse.json({ push, ntfy });
  } catch (error) {
    return errorResponse(error, "Test-Benachrichtigung fehlgeschlagen.");
  }
}
