import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { emailVerificationMode } from "@/lib/mailer";
import { authSecret } from "@/lib/secret-box";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { BAND_ROLE_MATRIX, type BandAction, type BandRole } from "@/lib/permissions";

export { BAND_ROLE_MATRIX, getBandActionPermissions } from "@/lib/permissions";
export type { BandAction, BandRole } from "@/lib/permissions";

export class AuthError extends Error {
  status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

type SessionPayload = {
  userId: string;
  email: string;
};

export const SESSION_COOKIE_NAME = "bandival_session";
export const CSRF_COOKIE_NAME = "bandival_csrf";
/** Sessions expire after 30 days without use and are extended while in use (at most one year in total). */
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const SESSION_MAX_LIFETIME_MS = 365 * 24 * 60 * 60 * 1000;
const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;

function shouldUseSecureCookies(): boolean {
  const configured = process.env.COOKIE_SECURE;
  if (configured === "true") {
    return true;
  }

  if (configured === "false") {
    return false;
  }

  return process.env.NODE_ENV === "production";
}

function getAuthSecret(): string {
  try {
    return authSecret();
  } catch (error) {
    throw new AuthError(error instanceof Error ? error.message : "AUTH_SECRET fehlt.", 500);
  }
}

function hashSessionToken(token: string): string {
  return createHash("sha256")
    .update(`${getAuthSecret()}:${token}`)
    .digest("hex");
}

export function hashInviteToken(token: string): string {
  return createHash("sha256")
    .update(`${getAuthSecret()}:invite:${token}`)
    .digest("hex");
}

/** Signature for the per-member calendar subscription feed. */
export function signCalendarFeed(memberId: string, version: number): string {
  return createHmac("sha256", getAuthSecret())
    .update(`calendar-feed:${memberId}:${version}`)
    .digest("base64url")
    .slice(0, 32);
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Client address for rate limiting. Proxies *append* to X-Forwarded-For, so only the entries added by our own
 * proxies are trustworthy – counted from the right (TRUSTED_PROXY_COUNT, default 1). Left-most values can be forged.
 */
export function getClientIp(request: NextRequest): string | null {
  const parsed = Number(process.env.TRUSTED_PROXY_COUNT ?? 1);
  const hops = Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 1;
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded && hops > 0) {
    const entries = forwarded.split(",").map((entry) => entry.trim()).filter(Boolean);
    const candidate = entries[Math.max(0, entries.length - hops)];
    if (candidate) return candidate.slice(0, 64);
  }
  return request.headers.get("x-real-ip")?.trim().slice(0, 64) || null;
}

/** Re-sends the session cookie so its lifetime follows the sliding server-side expiry. */
export function refreshSessionCookie(request: NextRequest, response: NextResponse): void {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (token) setSessionCookie(response, token);
}

export function setSessionCookie(response: NextResponse, token: string, maxAge = SESSION_TTL_SECONDS): void {
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: shouldUseSecureCookies(),
    sameSite: "lax",
    path: "/",
    maxAge,
  });
}

export function createCsrfToken(): string {
  return randomBytes(24).toString("base64url");
}

export function setCsrfCookie(response: NextResponse, token: string): void {
  response.cookies.set(CSRF_COOKIE_NAME, token, {
    httpOnly: false,
    secure: shouldUseSecureCookies(),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

/** Sets a CSRF cookie only if the request does not already carry one (avoids token races between tabs/requests). */
export function ensureCsrfCookie(request: NextRequest, response: NextResponse): void {
  if (!request.cookies.get(CSRF_COOKIE_NAME)?.value) {
    setCsrfCookie(response, createCsrfToken());
  }
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: shouldUseSecureCookies(),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export function clearCsrfCookie(response: NextResponse): void {
  response.cookies.set(CSRF_COOKIE_NAME, "", {
    httpOnly: false,
    secure: shouldUseSecureCookies(),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

function getRateLimitKey(email: string, ipAddress: string | null): string {
  return `${email.toLowerCase()}|${ipAddress ?? "unknown"}`;
}

export async function assertLoginAllowed(email: string, ipAddress: string | null): Promise<void> {
  const key = getRateLimitKey(email, ipAddress);
  const entry = await prisma.authRateLimit.findUnique({ where: { key } });
  if (!entry) {
    return;
  }

  if (entry.blockedUntil && entry.blockedUntil > new Date()) {
    throw new AuthError("Zu viele Anmeldeversuche. Bitte in ein paar Minuten erneut versuchen.", 429);
  }
}

export async function registerFailedLogin(email: string, ipAddress: string | null): Promise<void> {
  const key = getRateLimitKey(email, ipAddress);
  const now = new Date();
  const existing = await prisma.authRateLimit.findUnique({ where: { key } });

  if (!existing) {
    await prisma.authRateLimit.create({
      data: {
        key,
        attempts: 1,
        windowStart: now,
      },
    });
    return;
  }

  const elapsedMs = now.getTime() - existing.windowStart.getTime();
  if (elapsedMs > LOGIN_WINDOW_MS) {
    await prisma.authRateLimit.update({
      where: { key },
      data: {
        attempts: 1,
        windowStart: now,
        blockedUntil: null,
      },
    });
    return;
  }

  const attempts = existing.attempts + 1;
  await prisma.authRateLimit.update({
    where: { key },
    data: {
      attempts,
      blockedUntil: attempts >= LOGIN_MAX_ATTEMPTS ? new Date(now.getTime() + LOGIN_WINDOW_MS) : null,
    },
  });
}

export async function clearFailedLogin(email: string, ipAddress: string | null): Promise<void> {
  const key = getRateLimitKey(email, ipAddress);
  await prisma.authRateLimit.deleteMany({ where: { key } });
}

export async function createSession(
  user: SessionPayload,
  ipAddress: string | null,
  userAgent: string | null,
): Promise<string> {
  const token = randomBytes(48).toString("base64url");
  const sessionHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

  await prisma.authSession.create({
    data: {
      userId: user.userId,
      sessionHash,
      expiresAt,
      ipAddress,
      userAgent: userAgent?.slice(0, 500) ?? null,
    },
  });

  return token;
}

export async function revokeSession(token: string): Promise<void> {
  const sessionHash = hashSessionToken(token);
  await prisma.authSession.updateMany({
    where: {
      sessionHash,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
}

export async function revokeOtherSessions(userId: string, currentToken: string | undefined): Promise<void> {
  const currentHash = currentToken ? hashSessionToken(currentToken) : undefined;
  await prisma.authSession.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(currentHash ? { sessionHash: { not: currentHash } } : {}),
    },
    data: { revokedAt: new Date() },
  });
}

const UNVERIFIED_ALLOWED = ["/api/auth/", "/api/account/"];

export async function requireAuthUser(request: NextRequest): Promise<SessionPayload> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    throw new AuthError("Nicht angemeldet.", 401);
  }

  const sessionHash = hashSessionToken(token);
  const now = new Date();

  const session = await prisma.authSession.findFirst({
    where: {
      sessionHash,
      revokedAt: null,
      expiresAt: {
        gt: now,
      },
    },
    include: {
      user: { select: { id: true, email: true, emailVerifiedAt: true } },
    },
  });

  if (!session) {
    throw new AuthError("Sitzung abgelaufen. Bitte erneut anmelden.", 401);
  }

  // Unconfirmed addresses only reach the auth/account endpoints (login, resend mail, profile) while verification is required.
  if (!session.user.emailVerifiedAt && !UNVERIFIED_ALLOWED.some((prefix) => request.nextUrl.pathname.startsWith(prefix)) && emailVerificationMode() === "required") {
    throw new AuthError("Bitte bestätige zuerst deine E-Mail-Adresse.", 403);
  }

  // Throttle activity writes – updating on every request is needless DB load.
  if (now.getTime() - session.lastActivityAt.getTime() > SESSION_TOUCH_INTERVAL_MS) {
    // Sliding expiry: whoever uses Bandival stays signed in; idle sessions end after 30 days.
    const renewed = new Date(Math.min(now.getTime() + SESSION_TTL_SECONDS * 1000, session.createdAt.getTime() + SESSION_MAX_LIFETIME_MS));
    await prisma.authSession.update({
      where: { id: session.id },
      data: { lastActivityAt: now, ...(renewed.getTime() - session.expiresAt.getTime() > 60 * 60 * 1000 ? { expiresAt: renewed } : {}) },
    });
  }

  return {
    userId: session.user.id,
    email: session.user.email,
  };
}

export async function getBandRole(userId: string, bandId: string): Promise<BandRole> {
  const member = await prisma.bandMember.findUnique({
    where: { bandId_userId: { bandId, userId } },
    select: { role: true },
  });

  if (!member) {
    throw new AuthError("Kein Zugriff auf diese Band.", 403);
  }

  return member.role;
}

export async function requireBandRole(userId: string, bandId: string, roles: BandRole[]): Promise<BandRole> {
  const role = await getBandRole(userId, bandId);
  if (!roles.includes(role)) {
    throw new AuthError("Dafür fehlen dir die Berechtigungen.", 403);
  }
  return role;
}

export type AccessOptions = {
  /** Guests (session musicians) only get read access to setlists explicitly shared with them. */
  allowGuest?: boolean;
};

export async function requireBandMembership(userId: string, bandId: string, options: AccessOptions = {}): Promise<BandRole> {
  const role = await getBandRole(userId, bandId);
  if (role === "guest" && !options.allowGuest) {
    throw new AuthError("Als Gast hast du darauf keinen Zugriff.", 403);
  }
  return role;
}

/** IDs of the setlists shared with a guest in a band. */
export async function getGuestSetlistIds(userId: string, bandId: string): Promise<string[]> {
  const rows = await prisma.guestSetlistAccess.findMany({
    where: { member: { userId, bandId, role: "guest" } },
    select: { setlistId: true },
  });
  return rows.map((row) => row.setlistId);
}

export async function requireBandAction(userId: string, bandId: string, action: BandAction): Promise<BandRole> {
  const role = await getBandRole(userId, bandId);
  if (!BAND_ROLE_MATRIX[action].includes(role)) {
    throw new AuthError("Dafür fehlen dir die Berechtigungen.", 403);
  }
  return role;
}

/** Regular band members (owner/admin/member) – guests are excluded by default. */
const memberFilter = (userId: string) => ({ members: { some: { userId, role: { not: "guest" as const } } } });
const guestSetlistFilter = (userId: string) => ({ guestAccess: { some: { member: { userId, role: "guest" as const } } } });

export async function assertSongAccess(userId: string, songId: string, options: AccessOptions = {}): Promise<{ bandId: string }> {
  const song = await prisma.song.findFirst({
    where: options.allowGuest
      ? { id: songId, OR: [{ band: memberFilter(userId) }, { setlistItems: { some: { setlist: guestSetlistFilter(userId) } } }] }
      : { id: songId, band: memberFilter(userId) },
    select: { bandId: true },
  });

  if (!song) {
    throw new AuthError("Song nicht gefunden oder kein Zugriff.", 404);
  }
  return song;
}

export async function assertSetlistAccess(userId: string, setlistId: string, options: AccessOptions = {}): Promise<{ bandId: string }> {
  const setlist = await prisma.setlist.findFirst({
    where: options.allowGuest
      ? { id: setlistId, OR: [{ band: memberFilter(userId) }, guestSetlistFilter(userId)] }
      : { id: setlistId, band: memberFilter(userId) },
    select: { bandId: true },
  });

  if (!setlist) {
    throw new AuthError("Setlist nicht gefunden oder kein Zugriff.", 404);
  }
  return setlist;
}

export async function assertAlbumAccess(userId: string, albumId: string): Promise<{ bandId: string }> {
  const album = await prisma.album.findFirst({
    where: { id: albumId, band: memberFilter(userId) },
    select: { bandId: true },
  });

  if (!album) {
    throw new AuthError("Album nicht gefunden oder kein Zugriff.", 404);
  }
  return album;
}

export async function assertThreadAccess(userId: string, threadId: string): Promise<{ bandId: string; songId: string }> {
  const thread = await prisma.discussionThread.findFirst({
    where: { id: threadId, song: { band: memberFilter(userId) } },
    select: { songId: true, song: { select: { bandId: true } } },
  });

  if (!thread) {
    throw new AuthError("Diskussion nicht gefunden oder kein Zugriff.", 404);
  }
  return { bandId: thread.song.bandId, songId: thread.songId };
}

export async function assertEventAccess(userId: string, eventId: string): Promise<{ bandId: string }> {
  const event = await prisma.event.findFirst({
    where: { id: eventId, band: memberFilter(userId) },
    select: { bandId: true },
  });

  if (!event) {
    throw new AuthError("Termin nicht gefunden oder kein Zugriff.", 404);
  }
  return event;
}

/** Ensures all given song IDs belong to the band (prevents cross-band references). */
export async function assertSongsInBand(bandId: string, songIds: string[]): Promise<void> {
  const unique = Array.from(new Set(songIds));
  if (unique.length === 0) {
    return;
  }
  const count = await prisma.song.count({ where: { bandId, id: { in: unique } } });
  if (count !== unique.length) {
    throw new AuthError("Mindestens ein Song gehört nicht zu dieser Band.", 400);
  }
}

export async function writeAuditLog(args: {
  bandId: string;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  payload?: Prisma.InputJsonValue;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        bandId: args.bandId,
        actorUserId: args.actorUserId ?? null,
        action: args.action,
        entityType: args.entityType,
        entityId: args.entityId ?? null,
        payload: args.payload,
      },
    });
  } catch (error) {
    // Audit logging must never break the primary action.
    console.error("[audit]", error);
  }
}
