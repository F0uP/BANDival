import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseBandId } from "@/lib/api";
import { assertSongsInBand, requireAuthUser, requireBandAction, getGuestSetlistIds, requireBandMembership, writeAuditLog } from "@/lib/auth";
import { errorResponse, json } from "@/lib/http";
import { notifyBandMembers } from "@/lib/notifications";
import { setlistDetailInclude } from "@/lib/schemas";
import { normalizeTags, presentSetlist } from "@/lib/setlists";

const createSetlistSchema = z.object({
  bandId: z.string().uuid(),
  name: z.string().trim().min(1, "Bitte einen Namen angeben.").max(200),
  description: z.string().max(5000).nullable().optional(),
  songIds: z.array(z.string().uuid()).max(200).default([]),
  instruments: z.array(z.string().max(80)).max(40).optional(),
  equipment: z.array(z.string().max(80)).max(40).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const bandId = parseBandId(request.nextUrl.searchParams.get("bandId"));
    const role = await requireBandMembership(session.userId, bandId, { allowGuest: true });
    const guestFilter = role === "guest" ? { id: { in: await getGuestSetlistIds(session.userId, bandId) } } : {};

    const setlists = await prisma.setlist.findMany({
      where: { bandId, ...guestFilter },
      include: setlistDetailInclude,
      orderBy: { updatedAt: "desc" },
    });

    return json({ setlists: setlists.map(presentSetlist) });
  } catch (error) {
    return errorResponse(error, "Setlists konnten nicht geladen werden.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const payload = createSetlistSchema.parse(await request.json());
    await requireBandAction(session.userId, payload.bandId, "setlists.create");
    await assertSongsInBand(payload.bandId, payload.songIds);

    const setlist = await prisma.setlist.create({
      data: {
        bandId: payload.bandId,
        name: payload.name,
        description: payload.description?.trim() || null,
        instruments: normalizeTags(payload.instruments ?? []),
        equipment: normalizeTags(payload.equipment ?? []),
        items: {
          create: payload.songIds.map((songId, index) => ({ songId, position: index + 1 })),
        },
      },
      include: setlistDetailInclude,
    });

    await writeAuditLog({
      bandId: payload.bandId,
      actorUserId: session.userId,
      action: "setlist_created",
      entityType: "setlist",
      entityId: setlist.id,
      payload: { name: payload.name, setlistId: setlist.id },
    });

    await notifyBandMembers({
      bandId: payload.bandId,
      actorUserId: session.userId,
      kind: "setlist",
      type: "setlist_created",
      title: "Neue Setlist",
      body: `„${payload.name}“ wurde erstellt.`,
      payload: { setlistId: setlist.id },
    });

    return json({ setlist: presentSetlist(setlist) }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Setlist konnte nicht erstellt werden.");
  }
}
