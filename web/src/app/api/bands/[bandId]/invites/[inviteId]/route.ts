import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  AuthError,
  hashInviteToken,
  requireAuthUser,
  requireBandAction,
  writeAuditLog,
} from "@/lib/auth";
import { sendInviteEmail } from "@/lib/invite-mail";

const patchSchema = z.object({
  expiresInDays: z.number().int().min(1).max(90),
});

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ bandId: string; inviteId: string }> },
) {
  try {
    const session = await requireAuthUser(request);
    const { bandId, inviteId } = await context.params;
    await requireBandAction(session.userId, bandId, "invites.manage");

    const invite = await prisma.bandInvite.findFirst({
      where: {
        id: inviteId,
        bandId,
        revokedAt: null,
      },
      select: {
        id: true,
        email: true,
        acceptedAt: true,
      },
    });

    if (!invite) {
      throw new AuthError("Invite not found.", 404);
    }

    if (invite.acceptedAt) {
      throw new AuthError("Accepted invites cannot be revoked.", 409);
    }

    await prisma.bandInvite.update({
      where: { id: invite.id },
      data: { revokedAt: new Date() },
    });

    await writeAuditLog({
      bandId,
      actorUserId: session.userId,
      action: "invite_revoked",
      entityType: "band_invite",
      entityId: invite.id,
      payload: { email: invite.email },
    });

    return NextResponse.json({ ok: true, inviteId: invite.id });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to revoke invite." },
      { status: 400 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ bandId: string; inviteId: string }> },
) {
  try {
    const session = await requireAuthUser(request);
    const { bandId, inviteId } = await context.params;
    await requireBandAction(session.userId, bandId, "invites.manage");

    const payload = patchSchema.parse(await request.json());
    const expiresAt = new Date(Date.now() + payload.expiresInDays * 24 * 60 * 60 * 1000);

    const invite = await prisma.bandInvite.findFirst({
      where: { id: inviteId, bandId, revokedAt: null },
      select: { id: true, email: true, acceptedAt: true },
    });

    if (!invite) {
      throw new AuthError("Invite not found.", 404);
    }

    if (invite.acceptedAt) {
      throw new AuthError("Accepted invites cannot be updated.", 409);
    }

    const updated = await prisma.bandInvite.update({
      where: { id: invite.id },
      data: { expiresAt },
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
      action: "invite_expiry_updated",
      entityType: "band_invite",
      entityId: invite.id,
      payload: { email: invite.email, expiresAt: expiresAt.toISOString() },
    });

    return NextResponse.json({ invite: updated });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update invite." },
      { status: 400 },
    );
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ bandId: string; inviteId: string }> },
) {
  try {
    const session = await requireAuthUser(request);
    const { bandId, inviteId } = await context.params;
    await requireBandAction(session.userId, bandId, "invites.manage");

    const [invite, band] = await Promise.all([
      prisma.bandInvite.findFirst({
        where: { id: inviteId, bandId, revokedAt: null },
        select: { id: true, email: true, acceptedAt: true, expiresAt: true },
      }),
      prisma.band.findUnique({ where: { id: bandId }, select: { name: true } }),
    ]);

    if (!invite) {
      throw new AuthError("Invite not found.", 404);
    }

    if (!band) {
      throw new AuthError("Band not found.", 404);
    }

    if (invite.acceptedAt) {
      throw new AuthError("Accepted invites cannot be resent.", 409);
    }

    const token = randomBytes(24).toString("base64url");
    const tokenHash = hashInviteToken(token);

    const replacement = await prisma.$transaction(async (tx) => {
      await tx.bandInvite.update({
        where: { id: invite.id },
        data: { revokedAt: new Date() },
      });

      return tx.bandInvite.create({
        data: {
          bandId,
          email: invite.email,
          tokenHash,
          invitedByUserId: session.userId,
          expiresAt: invite.expiresAt,
        },
        select: {
          id: true,
          email: true,
          expiresAt: true,
          acceptedAt: true,
          createdAt: true,
        },
      });
    });

    await writeAuditLog({
      bandId,
      actorUserId: session.userId,
      action: "invite_resent",
      entityType: "band_invite",
      entityId: replacement.id,
      payload: { email: replacement.email, previousInviteId: invite.id },
    });

    const mail = await sendInviteEmail({
      recipientEmail: replacement.email,
      bandName: band.name,
      invite: { expiresAt: replacement.expiresAt },
      token,
    });

    return NextResponse.json({
      invite: replacement,
      inviteToken: token,
      inviteLink: mail.link,
      emailSent: mail.sent,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to resend invite." },
      { status: 400 },
    );
  }
}
