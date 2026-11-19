import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuthUser, requireBandAction, requireBandMembership, writeAuditLog } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse } from "@/lib/http";
import { parseRider, riderSchema } from "@/lib/rider";

type Context = { params: Promise<{ bandId: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const bandId = parseUuid((await context.params).bandId, "Band-ID");
    await requireBandMembership(session.userId, bandId);
    const band = await prisma.band.findUniqueOrThrow({ where: { id: bandId }, select: { rider: true } });
    return NextResponse.json({ rider: parseRider(band.rider) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const bandId = parseUuid((await context.params).bandId, "Band-ID");
    await requireBandAction(session.userId, bandId, "band.manage");
    const rider = riderSchema.parse(await request.json());
    await prisma.band.update({ where: { id: bandId }, data: { rider: rider as unknown as Prisma.InputJsonValue } });
    await writeAuditLog({ bandId, actorUserId: session.userId, action: "band_updated", entityType: "band", entityId: bandId, payload: { rider: true } });
    return NextResponse.json({ rider });
  } catch (error) {
    return errorResponse(error, "Rider konnte nicht gespeichert werden.");
  }
}
