import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertSongAccess, requireAuthUser } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse } from "@/lib/http";

export async function DELETE(request: NextRequest, context: { params: Promise<{ songId: string; partId: string }> }) {
  try {
    const session = await requireAuthUser(request);
    const params = await context.params;
    const songId = parseUuid(params.songId, "Song-ID");
    const partId = parseUuid(params.partId, "Stimmen-ID");
    await assertSongAccess(session.userId, songId);
    await prisma.songPart.deleteMany({ where: { id: partId, songId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
