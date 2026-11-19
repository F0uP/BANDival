import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AuthError, getBandRole, requireAuthUser, requireBandMembership } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse } from "@/lib/http";
import { cancelAudioWork, deleteAudioFiles } from "@/lib/audio";

const patchSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  notes: z.string().max(5000).nullable().optional(),
});

type Context = { params: Promise<{ ideaId: string }> };

async function load(request: NextRequest, context: Context) {
  const session = await requireAuthUser(request);
  const ideaId = parseUuid((await context.params).ideaId, "Ideen-ID");
  const idea = await prisma.idea.findUnique({ where: { id: ideaId } });
  if (!idea) throw new AuthError("Idee nicht gefunden.", 404);
  await requireBandMembership(session.userId, idea.bandId);
  return { session, idea };
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const { idea } = await load(request, context);
    const payload = patchSchema.parse(await request.json());
    await prisma.idea.update({
      where: { id: idea.id },
      data: { title: payload.title, notes: payload.notes === undefined ? undefined : payload.notes?.trim() || null },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    const { session, idea } = await load(request, context);
    const role = await getBandRole(session.userId, idea.bandId);
    if (idea.createdByUserId !== session.userId && role !== "owner" && role !== "admin") {
      throw new AuthError("Nur eigene Ideen können gelöscht werden.", 403);
    }
    await prisma.idea.delete({ where: { id: idea.id } });
    await cancelAudioWork("idea", idea.id);
    await deleteAudioFiles(idea);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
