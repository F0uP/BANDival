import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AuthError, hashInviteToken, requireAuthUser, writeAuditLog } from "@/lib/auth";
import { notifyBandMembers } from "@/lib/notifications";

const schema = z.object({
  token: z.string().min(8).max(500),
});

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const payload = schema.parse(await request.json());

    const invite = await prisma.bandInvite.findFirst({
      where: {
        tokenHash: hashInviteToken(payload.token),
        revokedAt: null,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (!invite) {
      throw new AuthError("Invite token is invalid or expired.", 404);
    }

    if (invite.email.toLowerCase() !== session.email.toLowerCase()) {
      throw new AuthError("Invite email does not match your account email.", 403);
    }

    await prisma.$transaction(async (tx) => {
      await tx.bandMember.upsert({
        where: {
          bandId_userId: {
            bandId: invite.bandId,
            userId: session.userId,
          },
        },
        create: {
          bandId: invite.bandId,
          userId: session.userId,
          role: "member",
        },
        update: {},
      });

      await tx.bandInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });
    });

    await writeAuditLog({
      bandId: invite.bandId,
      actorUserId: session.userId,
      action: "invite_accepted",
      entityType: "band_invite",
      entityId: invite.id,
      payload: { email: session.email },
    });

    await notifyBandMembers({
      bandId: invite.bandId,
      actorUserId: session.userId,
      kind: "invite",
      type: "invite_accepted",
      title: "Einladung angenommen",
      body: `${session.email} ist der Band beigetreten.`,
      payload: { inviteId: invite.id },
    });

    return NextResponse.json({ ok: true, bandId: invite.bandId });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to accept invite." },
      { status: 400 },
    );
  }
}
