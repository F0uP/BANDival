import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthUser, requireBandAction } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse } from "@/lib/http";

/** Revokes a public tech-rider link immediately. */
export async function DELETE(request: NextRequest, context: { params: Promise<{ bandId: string; shareId: string }> }) {
  try {
    const session = await requireAuthUser(request);
    const params = await context.params;
    const bandId = parseUuid(params.bandId, "Band-ID");
    await requireBandAction(session.userId, bandId, "events.manage");
    await prisma.riderShare.deleteMany({ where: { id: parseUuid(params.shareId, "Link-ID"), bandId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
