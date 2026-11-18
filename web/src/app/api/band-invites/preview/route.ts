import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashInviteToken } from "@/lib/auth";
import { errorResponse } from "@/lib/http";

/** Public: shows band name + invited e-mail for a valid invite token (used on the login screen). */
export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token")?.trim() ?? "";
    if (token.length < 8 || token.length > 500) {
      return NextResponse.json({ valid: false });
    }

    const invite = await prisma.bandInvite.findFirst({
      where: { tokenHash: hashInviteToken(token), revokedAt: null, acceptedAt: null, expiresAt: { gt: new Date() } },
      select: {
        email: true,
        expiresAt: true,
        band: { select: { name: true } },
        invitedBy: { select: { displayName: true } },
      },
    });

    if (!invite) {
      return NextResponse.json({ valid: false });
    }

    return NextResponse.json({
      valid: true,
      email: invite.email,
      bandName: invite.band.name,
      invitedBy: invite.invitedBy.displayName,
      expiresAt: invite.expiresAt,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
