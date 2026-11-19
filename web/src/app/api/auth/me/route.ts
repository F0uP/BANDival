import { NextRequest, NextResponse } from "next/server";
import { emailVerificationMode } from "@/lib/mailer";
import { prisma } from "@/lib/prisma";
import { ensureCsrfCookie, requireAuthUser, refreshSessionCookie } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/core";
import { localeFromRequest } from "@/lib/i18n/server";
import { isInstanceAdmin } from "@/lib/legal";

/**
 * Keeps the language of this browser and the account in sync: an explicit choice (cookie) is stored on the
 * account – background messages (push, e-mails) use it – and a new device takes over the stored language.
 */
async function syncLocale(request: NextRequest, response: NextResponse, userId: string, stored: string | null) {
  const cookie = request.cookies.get(LOCALE_COOKIE)?.value;
  if (isLocale(cookie)) {
    if (cookie !== stored) await prisma.appUser.update({ where: { id: userId }, data: { locale: cookie } }).catch(() => undefined);
    return;
  }
  if (isLocale(stored)) {
    response.cookies.set(LOCALE_COOKIE, stored, { path: "/", maxAge: 31_536_000, sameSite: "lax" });
    return;
  }
  await prisma.appUser.update({ where: { id: userId }, data: { locale: localeFromRequest(request) } }).catch(() => undefined);
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const user = await prisma.appUser.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        emailVerifiedAt: true,
        totpEnabledAt: true,
        ntfyTopicUrl: true,
        locale: true,
        memberships: {
          orderBy: { joinedAt: "asc" },
          select: {
            role: true,
            instrumentPrimary: true,
            band: { select: { id: true, name: true, timezone: true } },
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
    }

    const bands = user.memberships.map((membership) => ({
      id: membership.band.id,
      name: membership.band.name,
      timezone: membership.band.timezone,
      role: membership.role,
      instrument: membership.instrumentPrimary,
    }));

    const roleRank = { owner: 0, admin: 1, member: 2, guest: 3 } as const;
    const defaultBand = [...bands].sort((a, b) => roleRank[a.role] - roleRank[b.role])[0];

    const response = NextResponse.json({
      user: {
        userId: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        emailVerified: Boolean(user.emailVerifiedAt),
        emailVerificationRequired: !user.emailVerifiedAt && emailVerificationMode() === "required",
        twoFactorEnabled: Boolean(user.totpEnabledAt),
        ntfyTopicUrl: user.ntfyTopicUrl,
        defaultBandId: defaultBand?.id ?? null,
        bandIds: bands.map((band) => band.id),
        bands,
        instanceAdmin: await isInstanceAdmin(user.id),
      },
    });
    ensureCsrfCookie(request, response);
    refreshSessionCookie(request, response);
    await syncLocale(request, response, user.id, user.locale);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
