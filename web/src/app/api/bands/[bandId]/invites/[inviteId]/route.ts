import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthError, requireAuthUser, requireBandMembership, writeAuditLog } from "@/lib/auth";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ bandId: string; inviteId: string }> },
) {
  try {
    const session = await requireAuthUser(request);
    const { bandId, inviteId } = await context.params;
    await requireBandMembership(session.userId, bandId);

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
