import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AuthError, hashInviteToken, requireAuthUser, requireBandAction, writeAuditLog } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse } from "@/lib/http";
import { sendInviteEmail } from "@/lib/invite-mail";

const patchSchema = z.object({
  expiresInDays: z.number().int().min(1).max(90),
});

type Context = { params: Promise<{ bandId: string; inviteId: string }> };

const inviteSelect = { id: true, email: true, expiresAt: true, acceptedAt: true, revokedAt: true, createdAt: true } as const;

async function resolve(context: Context) {
  const params = await context.params;
  return { bandId: parseUuid(params.bandId, "Band-ID"), inviteId: parseUuid(params.inviteId, "Einladungs-ID") };
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const { bandId, inviteId } = await resolve(context);
    await requireBandAction(session.userId, bandId, "invites.manage");

    const invite = await prisma.bandInvite.findFirst({
      where: { id: inviteId, bandId, revokedAt: null },
      select: { id: true, email: true, acceptedAt: true },
    });
    if (!invite) {
      throw new AuthError("Einladung nicht gefunden.", 404);
    }
    if (invite.acceptedAt) {
      throw new AuthError("Angenommene Einladungen können nicht widerrufen werden.", 409);
    }

    await prisma.bandInvite.update({ where: { id: invite.id }, data: { revokedAt: new Date() } });
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
    return errorResponse(error, "Einladung konnte nicht widerrufen werden.");
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const { bandId, inviteId } = await resolve(context);
    await requireBandAction(session.userId, bandId, "invites.manage");

    const payload = patchSchema.parse(await request.json());
    const expiresAt = new Date(Date.now() + payload.expiresInDays * 24 * 60 * 60 * 1000);

    const invite = await prisma.bandInvite.findFirst({
      where: { id: inviteId, bandId, revokedAt: null },
      select: { id: true, email: true, acceptedAt: true },
    });
    if (!invite) {
      throw new AuthError("Einladung nicht gefunden.", 404);
    }
    if (invite.acceptedAt) {
      throw new AuthError("Angenommene Einladungen können nicht geändert werden.", 409);
    }

    const updated = await prisma.bandInvite.update({ where: { id: invite.id }, data: { expiresAt }, select: inviteSelect });
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
    return errorResponse(error, "Einladung konnte nicht aktualisiert werden.");
  }
}

/** Re-issues the invite with a fresh token (old link stops working) and re-sends the e-mail. */
export async function POST(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const { bandId, inviteId } = await resolve(context);
    await requireBandAction(session.userId, bandId, "invites.manage");

    const [invite, band] = await Promise.all([
      prisma.bandInvite.findFirst({
        where: { id: inviteId, bandId, revokedAt: null },
        select: { id: true, email: true, acceptedAt: true, expiresAt: true },
      }),
      prisma.band.findUnique({ where: { id: bandId }, select: { name: true } }),
    ]);
    if (!invite || !band) {
      throw new AuthError("Einladung nicht gefunden.", 404);
    }
    if (invite.acceptedAt) {
      throw new AuthError("Angenommene Einladungen können nicht erneut gesendet werden.", 409);
    }

    const token = randomBytes(24).toString("base64url");
    const minExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const expiresAt = invite.expiresAt > minExpiry ? invite.expiresAt : minExpiry;

    const replacement = await prisma.$transaction(async (tx) => {
      await tx.bandInvite.update({ where: { id: invite.id }, data: { revokedAt: new Date() } });
      return tx.bandInvite.create({
        data: { bandId, email: invite.email, tokenHash: hashInviteToken(token), invitedByUserId: session.userId, expiresAt },
        select: inviteSelect,
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

    const mail = await sendInviteEmail({ recipientEmail: replacement.email, bandName: band.name, invite: { expiresAt }, token });

    return NextResponse.json({ invite: replacement, inviteToken: token, inviteLink: mail.link, emailSent: mail.sent });
  } catch (error) {
    return errorResponse(error, "Einladung konnte nicht erneut gesendet werden.");
  }
}
