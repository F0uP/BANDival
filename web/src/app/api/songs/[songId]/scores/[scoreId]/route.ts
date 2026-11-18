import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AuthError, assertSongAccess, requireAuthUser, writeAuditLog } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse } from "@/lib/http";
import { sanitizeScore } from "@/lib/notation/model";
import { conflictBody, currentRevision, saveDocument } from "@/lib/merge/server";

const patchSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  instrument: z.string().trim().max(40).nullable().optional(),
  data: z.unknown().optional(),
  /** Legacy optimistic concurrency (ignored – replaced by baseRevision). */
  baseUpdatedAt: z.string().datetime().optional(),
  /** Revision the client started from – changes of others are merged in (per note). */
  baseRevision: z.number().int().positive().nullable().optional(),
});

type Context = { params: Promise<{ songId: string; scoreId: string }> };

const select = {
  id: true, songId: true, title: true, instrument: true, data: true, createdAt: true, updatedAt: true,
  createdBy: { select: { id: true, displayName: true } },
} as const;

async function load(request: NextRequest, context: Context, allowGuest = false) {
  const session = await requireAuthUser(request);
  const params = await context.params;
  const songId = parseUuid(params.songId, "Song-ID");
  const scoreId = parseUuid(params.scoreId, "Noten-ID");
  const { bandId } = await assertSongAccess(session.userId, songId, { allowGuest });
  const score = await prisma.songScore.findFirst({ where: { id: scoreId, songId }, select });
  if (!score) throw new AuthError("Noten nicht gefunden.", 404);
  return { session, songId, bandId, score };
}

export async function GET(request: NextRequest, context: Context) {
  try {
    const { score } = await load(request, context, true);
    return NextResponse.json({ score: { ...score, revision: await currentRevision("score", score.id) } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const { session, score } = await load(request, context);
    const payload = patchSchema.parse(await request.json());
    const data = payload.data === undefined ? undefined : (JSON.parse(JSON.stringify(sanitizeScore(payload.data))) as Prisma.JsonValue);
    const merge = await saveDocument({
      docType: "score",
      docId: score.id,
      userId: session.userId,
      baseRevision: payload.baseRevision,
      mutate: (state) => ({
        ...state,
        ...(payload.title !== undefined ? { title: payload.title } : {}),
        ...(payload.instrument !== undefined ? { instrument: payload.instrument || null } : {}),
        ...(data !== undefined ? { data } : {}),
      }),
    });
    if (merge.status === "conflict") return NextResponse.json(conflictBody(merge), { status: 409 });
    const updated = await prisma.songScore.findUniqueOrThrow({ where: { id: score.id }, select });
    return NextResponse.json({ score: { ...updated, revision: merge.revision }, merge: { status: merge.status } });
  } catch (error) {
    return errorResponse(error, "Noten konnten nicht gespeichert werden.");
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    const { session, songId, bandId, score } = await load(request, context);
    await prisma.songScore.delete({ where: { id: score.id } });
    await writeAuditLog({ bandId, actorUserId: session.userId, action: "score_deleted", entityType: "song", entityId: songId, payload: { songId, title: score.title } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
