import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AuthError, hashInviteToken, requireAuthUser, writeAuditLog } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { notifyBandMembers } from "@/lib/notifications";

const schema = z.object({
  token: z.string().trim().min(8).max(500),
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
      include: { band: { select: { name: true } } },
    });

    if (!invite) {
      throw new AuthError("Die Einladung ist ungültig oder abgelaufen.", 404);
    }
    if (invite.email.toLowerCase() !== session.email.toLowerCase()) {
      throw new AuthError(`Diese Einladung wurde an ${invite.email} geschickt. Bitte melde dich mit dieser Adresse an.`, 403);
    }

    const user = await prisma.appUser.findUnique({ where: { id: session.userId }, select: { displayName: true } });

    const isGuestInvite = invite.role === "guest";
    await prisma.$transaction(async (tx) => {
      const existing = await tx.bandMember.findUnique({ where: { bandId_userId: { bandId: invite.bandId, userId: session.userId } } });
      const member = existing ?? await tx.bandMember.create({
        data: { bandId: invite.bandId, userId: session.userId, role: isGuestInvite ? "guest" : "member" },
      });
      if (existing?.role === "guest" && !isGuestInvite) {
        // A full membership invite promotes an existing guest.
        await tx.bandMember.update({ where: { id: existing.id }, data: { role: "member" } });
      }
      if (member.role === "guest" || (existing?.role === "guest" && isGuestInvite)) {
        const setlists = await tx.setlist.findMany({ where: { bandId: invite.bandId, id: { in: invite.guestSetlistIds } }, select: { id: true } });
        await tx.guestSetlistAccess.createMany({
          data: setlists.map((setlist) => ({ memberId: member.id, setlistId: setlist.id })),
          skipDuplicates: true,
        });
      }
      await tx.bandInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
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
      title: isGuestInvite ? "Neuer Gast" : "Neues Bandmitglied",
      body: isGuestInvite
        ? `${user?.displayName ?? session.email} ist als Gast dabei.`
        : `${user?.displayName ?? session.email} ist der Band beigetreten.`,
    });

    return NextResponse.json({ ok: true, bandId: invite.bandId, bandName: invite.band.name });
  } catch (error) {
    return errorResponse(error, "Einladung konnte nicht angenommen werden.");
  }
}
