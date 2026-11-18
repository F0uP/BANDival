import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuthUser, writeAuditLog } from "@/lib/auth";
import { createBandSlug } from "@/lib/bands";
import { DEFAULT_TIMEZONE } from "@/lib/dates";
import { errorResponse } from "@/lib/http";

const createSchema = z.object({
  name: z.string().trim().min(1, "Bitte einen Bandnamen angeben.").max(160),
});

/** Creates an additional band with the current user as owner. */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const payload = createSchema.parse(await request.json());

    const band = await prisma.$transaction(async (tx) => {
      const created = await tx.band.create({
        data: { name: payload.name, slug: createBandSlug(payload.name), timezone: DEFAULT_TIMEZONE },
        select: { id: true, name: true, timezone: true },
      });
      await tx.bandMember.create({ data: { bandId: created.id, userId: session.userId, role: "owner" } });
      return created;
    });

    await writeAuditLog({
      bandId: band.id,
      actorUserId: session.userId,
      action: "band_created",
      entityType: "band",
      entityId: band.id,
      payload: { name: band.name },
    });

    return NextResponse.json({ band: { ...band, role: "owner" } }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Band konnte nicht erstellt werden.");
  }
}
