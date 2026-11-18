import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AuthError, hashInviteToken, requireAuthUser, requireBandAction, writeAuditLog } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse } from "@/lib/http";
import { sendInviteEmail } from "@/lib/invite-mail";

const createSchema = z.object({
  email: z.string().trim().toLowerCase().email("Bitte eine gültige E-Mail-Adresse eingeben."),
  expiresInDays: z.number().int().min(1).max(90).optional(),
  role: z.enum(["member", "guest"]).default("member"),
  /** For guests: the setlists they may see (session musicians). */
  guestSetlistIds: z.array(z.string().uuid()).max(50).default([]),
});

const querySchema = z.object({
  status: z.enum(["open", "expired", "accepted", "revoked", "all"]).default("open"),
});

type Context = { params: Promise<{ bandId: string }> };

const inviteSelect = { id: true, email: true, role: true, guestSetlistIds: true, expiresAt: true, acceptedAt: true, revokedAt: true, createdAt: true } as const;

export async function GET(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const bandId = parseUuid((await context.params).bandId, "Band-ID");
    await requireBandAction(session.userId, bandId, "invites.manage");

    const parsed = querySchema.parse({ status: request.nextUrl.searchParams.get("status") ?? undefined });
    const now = new Date();

    const where = {
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
      where,
      orderBy: { createdAt: "desc" },
      select: inviteSelect,
      take: 200,
    });

    return NextResponse.json({ invites });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const bandId = parseUuid((await context.params).bandId, "Band-ID");
    await requireBandAction(session.userId, bandId, "invites.manage");

    const payload = createSchema.parse(await request.json());

    const [band, existingMember] = await Promise.all([
      prisma.band.findUnique({ where: { id: bandId }, select: { name: true } }),
      prisma.bandMember.findFirst({ where: { bandId, user: { email: payload.email } }, select: { id: true } }),
    ]);
    if (!band) {
      throw new AuthError("Band nicht gefunden.", 404);
    }
    if (existingMember) {
      throw new AuthError("Diese Person ist bereits Mitglied der Band.", 409);
    }
    const guestSetlistIds = payload.role === "guest" ? Array.from(new Set(payload.guestSetlistIds)) : [];
    if (payload.role === "guest") {
      if (guestSetlistIds.length === 0) {
        throw new AuthError("Wähle mindestens eine Setlist, die der Gast sehen darf.", 400);
      }
      const count = await prisma.setlist.count({ where: { bandId, id: { in: guestSetlistIds } } });
      if (count !== guestSetlistIds.length) {
        throw new AuthError("Mindestens eine Setlist gehört nicht zu dieser Band.", 400);
      }
    }

    // Replace still-open invites for the same address instead of piling them up.
    await prisma.bandInvite.updateMany({
      where: { bandId, email: payload.email, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    const token = randomBytes(24).toString("base64url");
    const expiresAt = new Date(Date.now() + (payload.expiresInDays ?? 14) * 24 * 60 * 60 * 1000);
    const invite = await prisma.bandInvite.create({
      data: {
        bandId,
        email: payload.email,
        tokenHash: hashInviteToken(token),
        invitedByUserId: session.userId,
        expiresAt,
        role: payload.role,
        guestSetlistIds,
      },
      select: inviteSelect,
    });

    await writeAuditLog({
      bandId,
      actorUserId: session.userId,
      action: "invite_created",
      entityType: "band_invite",
      entityId: invite.id,
      payload: { email: payload.email, role: payload.role, expiresAt: expiresAt.toISOString() },
    });

    const mail = await sendInviteEmail({ recipientEmail: payload.email, bandName: band.name, invite: { expiresAt }, token });

    return NextResponse.json({ invite, inviteToken: token, inviteLink: mail.link, emailSent: mail.sent }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Einladung konnte nicht erstellt werden.");
  }
}
