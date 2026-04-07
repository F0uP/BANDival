import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  AuthError,
  hashInviteToken,
  requireAuthUser,
  requireBandMembership,
  writeAuditLog,
} from "@/lib/auth";

const createSchema = z.object({
  email: z.string().email(),
  expiresInDays: z.number().int().min(1).max(90).optional(),
});

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ bandId: string }> },
) {
  try {
    const session = await requireAuthUser(request);
    const { bandId } = await context.params;
    await requireBandMembership(session.userId, bandId);

    const invites = await prisma.bandInvite.findMany({
      where: {
        bandId,
        revokedAt: null,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        expiresAt: true,
        acceptedAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ invites });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load invites." },
      { status: 400 },
    );
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ bandId: string }> },
) {
  try {
    const session = await requireAuthUser(request);
    const { bandId } = await context.params;
    await requireBandMembership(session.userId, bandId);

    const payload = createSchema.parse(await request.json());
    const normalizedEmail = payload.email.trim().toLowerCase();
    const token = randomBytes(24).toString("base64url");
    const tokenHash = hashInviteToken(token);
    const expiresAt = new Date(Date.now() + (payload.expiresInDays ?? 14) * 24 * 60 * 60 * 1000);

    const invite = await prisma.bandInvite.create({
      data: {
        bandId,
        email: normalizedEmail,
        tokenHash,
        invitedByUserId: session.userId,
        expiresAt,
      },
      select: {
        id: true,
        email: true,
        expiresAt: true,
        acceptedAt: true,
        createdAt: true,
      },
    });

    await writeAuditLog({
      bandId,
      actorUserId: session.userId,
      action: "invite_created",
      entityType: "band_invite",
      entityId: invite.id,
      payload: { email: normalizedEmail, expiresAt: expiresAt.toISOString() },
    });

    return NextResponse.json({ invite, inviteToken: token }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create invite." },
      { status: 400 },
    );
  }
}
