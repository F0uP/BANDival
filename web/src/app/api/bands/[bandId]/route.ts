import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AuthError, requireAuthUser, requireBandAction, requireBandMembership, writeAuditLog } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { isValidTimeZone } from "@/lib/dates";
import { errorResponse } from "@/lib/http";

const patchSchema = z.object({
  name: z.string().trim().min(1, "Der Bandname darf nicht leer sein.").max(160).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  timezone: z.string().refine(isValidTimeZone, "Unbekannte Zeitzone.").optional(),
});

const deleteSchema = z.object({
  confirmName: z.string(),
});

type Context = { params: Promise<{ bandId: string }> };

const bandSelect = { id: true, name: true, slug: true, description: true, timezone: true, createdAt: true } as const;

export async function GET(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const bandId = parseUuid((await context.params).bandId, "Band-ID");
    const role = await requireBandMembership(session.userId, bandId, { allowGuest: true });

    const band = await prisma.band.findUnique({ where: { id: bandId }, select: bandSelect });
    if (!band) {
      throw new AuthError("Band nicht gefunden.", 404);
    }

    if (role === "guest") {
      return NextResponse.json({ band: { ...band, role, stats: { songs: 0, setlists: 0, members: 0 } } });
    }

    const [songs, setlists, members] = await Promise.all([
      prisma.song.count({ where: { bandId } }),
      prisma.setlist.count({ where: { bandId } }),
      prisma.bandMember.count({ where: { bandId } }),
    ]);

    return NextResponse.json({ band: { ...band, role, stats: { songs, setlists, members } } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const bandId = parseUuid((await context.params).bandId, "Band-ID");
    await requireBandAction(session.userId, bandId, "band.manage");
    const payload = patchSchema.parse(await request.json());

    const band = await prisma.band.update({
      where: { id: bandId },
      data: payload,
      select: bandSelect,
    });

    await writeAuditLog({
      bandId,
      actorUserId: session.userId,
      action: "band_updated",
      entityType: "band",
      entityId: bandId,
      payload,
    });

    return NextResponse.json({ band });
  } catch (error) {
    return errorResponse(error, "Band konnte nicht gespeichert werden.");
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const bandId = parseUuid((await context.params).bandId, "Band-ID");
    const role = await requireBandMembership(session.userId, bandId);
    if (role !== "owner") {
      throw new AuthError("Nur Owner können eine Band löschen.", 403);
    }

    const payload = deleteSchema.parse(await request.json());
    const band = await prisma.band.findUnique({ where: { id: bandId }, select: { name: true } });
    if (!band) {
      throw new AuthError("Band nicht gefunden.", 404);
    }
    if (payload.confirmName.trim() !== band.name) {
      throw new AuthError("Der eingegebene Name stimmt nicht mit dem Bandnamen überein.", 400);
    }

    await prisma.$transaction([
      prisma.setlistItem.deleteMany({ where: { setlist: { bandId } } }),
      prisma.band.delete({ where: { id: bandId } }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Band konnte nicht gelöscht werden.");
  }
}
