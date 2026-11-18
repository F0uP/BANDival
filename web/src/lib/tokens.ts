import { createHash, createHmac, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { AuthError, safeEqual } from "@/lib/auth";
import { authSecret } from "@/lib/secret-box";

export type UserTokenKind = "password_reset" | "email_verify";

function secret(): string {
  try {
    return authSecret();
  } catch (error) {
    throw new AuthError(error instanceof Error ? error.message : "AUTH_SECRET fehlt.", 500);
  }
}

export function hashToken(token: string): string {
  return createHash("sha256").update(`${secret()}:user-token:${token}`).digest("hex");
}

/** Creates a single-use token (only its hash is stored) and invalidates older tokens of the same kind. */
export async function createUserToken(userId: string, kind: UserTokenKind, ttlMinutes: number): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await prisma.$transaction([
    prisma.userToken.updateMany({ where: { userId, kind, usedAt: null }, data: { usedAt: new Date() } }),
    prisma.userToken.create({
      data: { userId, kind, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + ttlMinutes * 60_000) },
    }),
  ]);
  return token;
}

/** Marks the token as used and returns its user – throws if invalid, used or expired. */
export async function consumeUserToken(token: string, kind: UserTokenKind): Promise<string> {
  const entry = await prisma.userToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!entry || entry.kind !== kind || entry.usedAt || entry.expiresAt < new Date()) {
    throw new AuthError("Der Link ist ungültig oder abgelaufen.", 400);
  }
  const updated = await prisma.userToken.updateMany({ where: { id: entry.id, usedAt: null }, data: { usedAt: new Date() } });
  if (updated.count !== 1) {
    throw new AuthError("Der Link wurde bereits verwendet.", 400);
  }
  return entry.userId;
}

/* -------------------------------------------------------------------------- */
/* Short-lived signed challenges (2FA login step)                             */
/* -------------------------------------------------------------------------- */

export function signChallenge(userId: string, ttlSeconds = 300): string {
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${userId}.${expires}`;
  const signature = createHmac("sha256", secret()).update(`2fa:${payload}`).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyChallenge(challenge: string): string {
  const [userId, expires, signature] = challenge.split(".");
  if (!userId || !expires || !signature) {
    throw new AuthError("Anmeldung abgelaufen. Bitte erneut anmelden.", 401);
  }
  const expected = createHmac("sha256", secret()).update(`2fa:${userId}.${expires}`).digest("base64url");
  if (!safeEqual(expected, signature) || Number(expires) < Date.now() / 1000) {
    throw new AuthError("Anmeldung abgelaufen. Bitte erneut anmelden.", 401);
  }
  return userId;
}

/* -------------------------------------------------------------------------- */
/* Registration mode                                                          */
/* -------------------------------------------------------------------------- */

export type RegistrationMode = "open" | "invite" | "closed";

export function getRegistrationMode(): RegistrationMode {
  const value = (process.env.REGISTRATION_MODE ?? "open").toLowerCase();
  return value === "invite" || value === "invite-only" ? "invite" : value === "closed" ? "closed" : "open";
}
