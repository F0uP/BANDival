import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AuthError, assertSongAccess, getBandRole, requireAuthUser } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse } from "@/lib/http";

const patchSchema = z.object({ resolved: z.boolean() });

type Context = { params: Promise<{ songId: string; audioId: string; commentId: string }> };

async function load(request: NextRequest, context: Context) {
  const session = await requireAuthUser(request);
  const params = await context.params;
  const songId = parseUuid(params.songId, "Song-ID");
  const audioId = parseUuid(params.audioId, "Audio-ID");
  const commentId = parseUuid(params.commentId, "Kommentar-ID");
  const { bandId } = await assertSongAccess(session.userId, songId);
  const comment = await prisma.audioComment.findFirst({ where: { id: commentId, audioVersionId: audioId, audioVersion: { songId } } });
  if (!comment) throw new AuthError("Kommentar nicht gefunden.", 404);
  return { session, bandId, comment };
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const { comment } = await load(request, context);
    const { resolved } = patchSchema.parse(await request.json());
    await prisma.audioComment.update({ where: { id: comment.id }, data: { resolvedAt: resolved ? new Date() : null } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    const { session, bandId, comment } = await load(request, context);
    const role = await getBandRole(session.userId, bandId);
    if (comment.userId !== session.userId && role !== "owner" && role !== "admin") {
      throw new AuthError("Nur eigene Kommentare können gelöscht werden.", 403);
    }
    await prisma.audioComment.delete({ where: { id: comment.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
