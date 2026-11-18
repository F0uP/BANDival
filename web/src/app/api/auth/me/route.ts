import { NextRequest, NextResponse } from "next/server";
import { emailVerificationMode } from "@/lib/mailer";
import { prisma } from "@/lib/prisma";
import { ensureCsrfCookie, requireAuthUser, refreshSessionCookie } from "@/lib/auth";
import { errorResponse } from "@/lib/http";

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
      },
    });
    ensureCsrfCookie(request, response);
    refreshSessionCookie(request, response);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
