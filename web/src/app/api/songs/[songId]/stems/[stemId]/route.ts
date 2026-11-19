import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AuthError, assertSongAccess, requireAuthUser } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse, toJsonSafe } from "@/lib/http";
import { deleteAudioFiles } from "@/lib/audio";

const patchSchema = z.object({
  label: z.string().trim().min(1).max(60).optional(),
  sortOrder: z.number().int().min(0).max(100).optional(),
});

type Context = { params: Promise<{ songId: string; stemId: string }> };

async function load(request: NextRequest, context: Context) {
  const session = await requireAuthUser(request);
  const params = await context.params;
  const songId = parseUuid(params.songId, "Song-ID");
  const stemId = parseUuid(params.stemId, "Spur-ID");
  await assertSongAccess(session.userId, songId);
  const stem = await prisma.songStem.findFirst({ where: { id: stemId, songId } });
  if (!stem) throw new AuthError("Spur nicht gefunden.", 404);
  return stem;
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const stem = await load(request, context);
    const payload = patchSchema.parse(await request.json());
    const updated = await prisma.songStem.update({ where: { id: stem.id }, data: payload });
    return NextResponse.json(toJsonSafe({ stem: updated }));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    const stem = await load(request, context);
    await prisma.songStem.delete({ where: { id: stem.id } });
    await deleteAudioFiles(stem);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
