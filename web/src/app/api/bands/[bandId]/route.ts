import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AuthError, requireAuthUser, requireBandAction, requireBandMembership, writeAuditLog } from "@/lib/auth";

const patchSchema = z.object({
  name: z.string().min(1).max(160),
});

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ bandId: string }> },
) {
  try {
    const session = await requireAuthUser(request);
    const { bandId } = await context.params;
    await requireBandAction(session.userId, bandId, "band.rename");

    const band = await prisma.band.findUnique({
      where: { id: bandId },
      select: { id: true, name: true, slug: true, description: true },
    });

    if (!band) {
      return NextResponse.json({ error: "Band not found." }, { status: 404 });
    }

    return NextResponse.json({ band });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load band." },
      { status: 400 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ bandId: string }> },
) {
  try {
    const session = await requireAuthUser(request);
    const { bandId } = await context.params;
    const payload = patchSchema.parse(await request.json());

    await requireBandMembership(session.userId, bandId);

    const band = await prisma.band.update({
      where: { id: bandId },
      data: { name: payload.name },
      select: { id: true, name: true, slug: true, description: true },
    });

    await writeAuditLog({
      bandId,
      actorUserId: session.userId,
      action: "band_updated",
      entityType: "band",
      entityId: bandId,
      payload: { name: payload.name },
    });

    return NextResponse.json({ band });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update band." },
      { status: 400 },
    );
  }
}
