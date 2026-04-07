import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseBandId } from "@/lib/api";
import { requireAuthUser, requireBandAction, requireBandMembership, writeAuditLog } from "@/lib/auth";
import { notifyBandMembers } from "@/lib/notifications";

const createSetlistSchema = z.object({
  bandId: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().max(5000).nullable().optional(),
  songIds: z.array(z.string().uuid()).default([]),
});

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const bandId = parseBandId(request.nextUrl.searchParams.get("bandId"));
    await requireBandMembership(session.userId, bandId);

    const setlists = await prisma.setlist.findMany({
      where: { bandId },
      include: {
        items: {
          orderBy: { position: "asc" },
          include: { song: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ setlists });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch setlists." },
      { status: 400 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const payload = createSetlistSchema.parse(await request.json());
    await requireBandAction(session.userId, payload.bandId, "setlists.create");

    const setlist = await prisma.setlist.create({
      data: {
        bandId: payload.bandId,
        name: payload.name,
        description: payload.description ?? null,
        items: {
          create: payload.songIds.map((songId, index) => ({
            songId,
            position: index + 1,
          })),
        },
      },
      include: {
        items: {
          orderBy: { position: "asc" },
          include: { song: true },
        },
      },
    });

    await writeAuditLog({
      bandId: payload.bandId,
      actorUserId: session.userId,
      action: "setlist_created",
      entityType: "setlist",
      entityId: setlist.id,
      payload: { name: payload.name },
    });

    await notifyBandMembers({
      bandId: payload.bandId,
      actorUserId: session.userId,
      kind: "setlist",
      type: "setlist_created",
      title: "Neue Setlist",
      body: `${payload.name} wurde erstellt.`,
      payload: { setlistId: setlist.id },
    });

    return NextResponse.json({ setlist }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create setlist." },
      { status: 400 },
    );
  }
}
