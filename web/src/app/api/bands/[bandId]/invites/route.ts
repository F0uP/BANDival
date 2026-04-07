import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  AuthError,
  hashInviteToken,
  requireBandAction,
  requireAuthUser,
  writeAuditLog,
} from "@/lib/auth";
import { sendInviteEmail } from "@/lib/invite-mail";
import { notifyBandMembers } from "@/lib/notifications";

const createSchema = z.object({
  email: z.string().email(),
  expiresInDays: z.number().int().min(1).max(90).optional(),
});

const querySchema = z.object({
  status: z.enum(["open", "expired", "accepted", "revoked", "all"]).default("open"),
});

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ bandId: string }> },
) {
  try {
    const session = await requireAuthUser(request);
    const { bandId } = await context.params;
    await requireBandAction(session.userId, bandId, "invites.manage");

    const parsed = querySchema.parse({
      status: request.nextUrl.searchParams.get("status") ?? undefined,
    });
    const now = new Date();

    const whereClause = {
      bandId,
      ...(parsed.status === "open"
        ? { revokedAt: null, acceptedAt: null, expiresAt: { gt: now } }
        : parsed.status === "expired"
          ? { revokedAt: null, acceptedAt: null, expiresAt: { lte: now } }
          : parsed.status === "accepted"
            ? { revokedAt: null, acceptedAt: { not: null } }
            : parsed.status === "revoked"
              ? { revokedAt: { not: null } }
              : {}),
    };

    const invites = await prisma.bandInvite.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
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
    await requireBandAction(session.userId, bandId, "invites.manage");

    const payload = createSchema.parse(await request.json());
    const normalizedEmail = payload.email.trim().toLowerCase();
    const token = randomBytes(24).toString("base64url");
    const tokenHash = hashInviteToken(token);
    const expiresAt = new Date(Date.now() + (payload.expiresInDays ?? 14) * 24 * 60 * 60 * 1000);

    const band = await prisma.band.findUnique({ where: { id: bandId }, select: { name: true } });
    if (!band) {
      throw new AuthError("Band not found.", 404);
    }

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

    const mail = await sendInviteEmail({
      recipientEmail: normalizedEmail,
      bandName: band.name,
      invite: { expiresAt },
      token,
    });

    await notifyBandMembers({
      bandId,
      actorUserId: session.userId,
      kind: "invite",
      type: "invite_created",
      title: "Neue Einladung",
      body: `${normalizedEmail} wurde eingeladen.`,
      payload: { inviteId: invite.id },
    });

    return NextResponse.json({ invite, inviteToken: token, inviteLink: mail.link, emailSent: mail.sent }, { status: 201 });
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
