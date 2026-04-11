import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

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

type BandRole = "owner" | "admin" | "member";

export type BandAction =
  | "band.rename"
  | "songs.create"
  | "setlists.create"
  | "events.create"
  | "invites.manage"
  | "availability.update"
  | "backup.export"
  | "backup.restore";

export const BAND_ROLE_MATRIX: Record<BandAction, BandRole[]> = {
  "band.rename": ["owner", "admin", "member"],
  "songs.create": ["owner", "admin", "member"],
  "setlists.create": ["owner", "admin", "member"],
  "events.create": ["owner", "admin"],
  "invites.manage": ["owner", "admin"],
  "availability.update": ["owner", "admin", "member"],
  "backup.export": ["owner", "admin"],
  "backup.restore": ["owner"],
};

const SESSION_COOKIE_NAME = "bandival_session";
const CSRF_COOKIE_NAME = "bandival_csrf";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
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
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new AuthError("AUTH_SECRET is not configured.", 500);
  }

  return secret;
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

export function getClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? null;
  }

  return request.headers.get("x-real-ip");
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
    sameSite: "strict",
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
    throw new AuthError("Too many login attempts. Please try again later.", 429);
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
      userAgent,
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

export async function requireAuthUser(request: NextRequest): Promise<SessionPayload> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    throw new AuthError("Not authenticated.", 401);
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
      user: true,
    },
  });

  if (!session) {
    throw new AuthError("Invalid session.", 401);
  }

  await prisma.authSession.update({
    where: { id: session.id },
    data: { lastActivityAt: now },
  });

  return {
    userId: session.user.id,
    email: session.user.email,
  };
}

export async function requireBandRole(
  userId: string,
  bandId: string,
  roles: BandRole[],
): Promise<void> {
  const member = await prisma.bandMember.findFirst({
    where: {
      userId,
      bandId,
    },
  });

  if (!member) {
    throw new AuthError("No membership in this band.", 403);
  }

  if (!roles.includes(member.role)) {
    throw new AuthError("Insufficient permissions.", 403);
  }
}

export async function requireBandMembership(userId: string, bandId: string): Promise<void> {
  await requireBandRole(userId, bandId, ["owner", "admin", "member"]);
}

export async function getBandRole(userId: string, bandId: string): Promise<BandRole> {
  const member = await prisma.bandMember.findFirst({
    where: {
      userId,
      bandId,
    },
    select: { role: true },
  });

  if (!member) {
    throw new AuthError("No membership in this band.", 403);
  }

  return member.role;
}

export async function requireBandAction(userId: string, bandId: string, action: BandAction): Promise<void> {
  const role = await getBandRole(userId, bandId);
  if (!BAND_ROLE_MATRIX[action].includes(role)) {
    throw new AuthError(`Insufficient permissions for action: ${action}.`, 403);
  }
}

export function getBandActionPermissions(role: BandRole): Record<BandAction, boolean> {
  return Object.fromEntries(
    (Object.keys(BAND_ROLE_MATRIX) as BandAction[]).map((action) => [action, BAND_ROLE_MATRIX[action].includes(role)]),
  ) as Record<BandAction, boolean>;
}

export async function assertSongAccess(userId: string, songId: string): Promise<void> {
  const song = await prisma.song.findFirst({
    where: {
      id: songId,
      band: {
        members: {
          some: { userId },
        },
      },
    },
    select: { id: true },
  });

  if (!song) {
    throw new AuthError("Access denied for this song.", 403);
  }
}

export async function assertSetlistAccess(userId: string, setlistId: string): Promise<void> {
  const setlist = await prisma.setlist.findFirst({
    where: {
      id: setlistId,
      band: {
        members: {
          some: { userId },
        },
      },
    },
    select: { id: true },
  });

  if (!setlist) {
    throw new AuthError("Access denied for this setlist.", 403);
  }
}

export async function assertAlbumAccess(userId: string, albumId: string): Promise<void> {
  const album = await prisma.album.findFirst({
    where: {
      id: albumId,
      band: {
        members: {
          some: { userId },
        },
      },
    },
    select: { id: true },
  });

  if (!album) {
    throw new AuthError("Access denied for this album.", 403);
  }
}

export async function assertThreadAccess(userId: string, threadId: string): Promise<void> {
  const thread = await prisma.discussionThread.findFirst({
    where: {
      id: threadId,
      song: {
        band: {
          members: {
            some: { userId },
          },
        },
      },
    },
    select: { id: true },
  });

  if (!thread) {
    throw new AuthError("Access denied for this discussion.", 403);
  }
}

export async function assertEventAccess(userId: string, eventId: string): Promise<void> {
  const event = await prisma.event.findFirst({
    where: {
      id: eventId,
      band: {
        members: {
          some: { userId },
        },
      },
    },
    select: { id: true },
  });

  if (!event) {
    throw new AuthError("Access denied for this event.", 403);
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
}
