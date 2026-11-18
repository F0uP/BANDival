import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertSongAccess, requireAuthUser } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse } from "@/lib/http";
import { conflictBody, currentRevision, saveDocument } from "@/lib/merge/server";

const upsertSchema = z.object({
  instrument: z.string().trim().min(1, "Bitte ein Instrument angeben.").max(40),
  kind: z.enum(["chordpro", "text", "tab"]).default("chordpro"),
  content: z.string().max(50000),
  baseRevision: z.number().int().positive().nullable().optional(),
});

type Context = { params: Promise<{ songId: string }> };

const select = {
  id: true, instrument: true, kind: true, content: true, updatedAt: true,
  updatedBy: { select: { id: true, displayName: true } },
} as const;

export async function GET(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const songId = parseUuid((await context.params).songId, "Song-ID");
    await assertSongAccess(session.userId, songId, { allowGuest: true });
    const parts = await prisma.songPart.findMany({ where: { songId }, orderBy: { instrument: "asc" }, select });
    const withRevision = [];
    for (const part of parts) withRevision.push({ ...part, revision: await currentRevision("part", part.id) });
    return NextResponse.json({ parts: withRevision });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Creates or replaces the part for an instrument (e.g. "Bass", "Keys", "Drums"). */
export async function PUT(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const songId = parseUuid((await context.params).songId, "Song-ID");
    await assertSongAccess(session.userId, songId);
    const payload = upsertSchema.parse(await request.json());
    const existing = await prisma.songPart.findUnique({ where: { songId_instrument: { songId, instrument: payload.instrument } }, select: { id: true } });
    if (existing) {
      // Existing part: merged git-like with what others changed since `baseRevision`.
      const merge = await saveDocument({
        docType: "part", docId: existing.id, userId: session.userId, baseRevision: payload.baseRevision,
        mutate: (state) => ({ ...state, kind: payload.kind, content: payload.content }),
      });
      if (merge.status === "conflict") return NextResponse.json(conflictBody(merge), { status: 409 });
      const part = await prisma.songPart.findUniqueOrThrow({ where: { id: existing.id }, select });
      return NextResponse.json({ part: { ...part, revision: merge.revision }, merge: { status: merge.status } });
    }
    const part = await prisma.songPart.create({
      data: { songId, instrument: payload.instrument, kind: payload.kind, content: payload.content, updatedByUserId: session.userId },
      select,
    });
    return NextResponse.json({ part: { ...part, revision: await currentRevision("part", part.id) }, merge: { status: "saved" } });
  } catch (error) {
    return errorResponse(error, "Stimme konnte nicht gespeichert werden.");
  }
}
