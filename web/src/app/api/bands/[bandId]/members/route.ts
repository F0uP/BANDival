import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthUser, requireBandMembership } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse } from "@/lib/http";

export async function GET(request: NextRequest, context: { params: Promise<{ bandId: string }> }) {
  try {
    const session = await requireAuthUser(request);
    const bandId = parseUuid((await context.params).bandId, "Band-ID");
    await requireBandMembership(session.userId, bandId);

    const members = await prisma.bandMember.findMany({
      where: { bandId },
      orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
      select: {
        id: true,
        userId: true,
        role: true,
        instrumentPrimary: true,
        joinedAt: true,
        user: { select: { id: true, email: true, displayName: true, avatarUrl: true } },
        guestSetlists: { select: { setlistId: true } },
      },
    });

    return NextResponse.json({ members });
  } catch (error) {
    return errorResponse(error);
  }
}
