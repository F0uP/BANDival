import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertSongAccess, requireAuthUser, writeAuditLog } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse } from "@/lib/http";
import { sanitizeScore } from "@/lib/notation/model";

const createSchema = z.object({
  title: z.string().trim().min(1, "Bitte einen Titel angeben.").max(120),
  instrument: z.string().trim().max(40).nullable().optional(),
  data: z.unknown(),
});

type Context = { params: Promise<{ songId: string }> };

const scoreSelect = {
  id: true, songId: true, title: true, instrument: true, data: true, createdAt: true, updatedAt: true,
  createdBy: { select: { id: true, displayName: true } },
} as const;

export async function GET(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const songId = parseUuid((await context.params).songId, "Song-ID");
    await assertSongAccess(session.userId, songId, { allowGuest: true });
    const scores = await prisma.songScore.findMany({ where: { songId }, orderBy: { createdAt: "asc" }, select: scoreSelect });
    return NextResponse.json({ scores });
  } catch (error) {
    return errorResponse(error, "Noten konnten nicht geladen werden.");
  }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const songId = parseUuid((await context.params).songId, "Song-ID");
    const { bandId } = await assertSongAccess(session.userId, songId);
    const payload = createSchema.parse(await request.json());
    const data = sanitizeScore(payload.data);
    const score = await prisma.songScore.create({
      data: {
        songId,
        title: payload.title,
        instrument: payload.instrument || data.instrument,
        data: data as unknown as Prisma.InputJsonValue,
        createdByUserId: session.userId,
      },
      select: scoreSelect,
    });
    await writeAuditLog({ bandId, actorUserId: session.userId, action: "score_created", entityType: "song", entityId: songId, payload: { songId, title: score.title } });
    return NextResponse.json({ score }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Noten konnten nicht angelegt werden.");
  }
}
