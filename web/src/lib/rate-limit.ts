import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/http";

/** Simple fixed-window rate limit stored in the database (works across restarts). */
export async function consumeRateLimit(key: string, max: number, windowMs: number): Promise<void> {
  const now = new Date();
  const entry = await prisma.authRateLimit.findUnique({ where: { key } });
  if (!entry || now.getTime() - entry.windowStart.getTime() > windowMs) {
    await prisma.authRateLimit.upsert({
      where: { key },
      create: { key, attempts: 1, windowStart: now },
      update: { attempts: 1, windowStart: now, blockedUntil: null },
    });
    return;
  }
  if (entry.attempts >= max) {
    throw new HttpError("Zu viele Anfragen – bitte in ein paar Minuten erneut versuchen.", 429);
  }
  await prisma.authRateLimit.update({ where: { key }, data: { attempts: { increment: 1 } } });
}
