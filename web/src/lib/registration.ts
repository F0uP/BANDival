import type { BandInvite } from "@/generated/prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  assertLoginAllowed,
  AuthError,
  createCsrfToken,
  createSession,
  hashInviteToken,
  registerFailedLogin,
  setCsrfCookie,
  setSessionCookie,
  writeAuditLog,
} from "@/lib/auth";
import { createBandSlug } from "@/lib/bands";
import { notifyBandMembers } from "@/lib/notifications";
import { sendVerificationMail } from "@/lib/account-mail";
import { emailVerificationMode } from "@/lib/mailer";
import { getRegistrationMode } from "@/lib/tokens";

/*
 * Account creation shared by the password and the passkey (passwordless) registration:
 * rate limit, unique e-mail, registration mode / invitation, band or invite membership, verification mail.
 */

export type RegistrationInput = {
  email: string;
  displayName: string;
  bandName?: string | null;
  inviteToken?: string | null;
};

/** Validates that this e-mail may register right now; returns the matching invitation (if any). */
export async function prepareRegistration(input: RegistrationInput, ipAddress: string | null): Promise<{ invite: BandInvite | null }> {
  await assertLoginAllowed(input.email, ipAddress);

  const existing = await prisma.appUser.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) {
    await registerFailedLogin(input.email, ipAddress);
    throw new AuthError("Für diese E-Mail-Adresse existiert bereits ein Account.", 409);
  }

  const invite = input.inviteToken
    ? await prisma.bandInvite.findFirst({
        where: { tokenHash: hashInviteToken(input.inviteToken), revokedAt: null, acceptedAt: null, expiresAt: { gt: new Date() } },
      })
    : null;
  const useInvite = invite && invite.email.toLowerCase() === input.email ? invite : null;

  const mode = getRegistrationMode();
  if (mode !== "open" && !useInvite) {
    const hasUsers = (await prisma.appUser.count({ take: 1 })) > 0;
    if (hasUsers) {
      throw new AuthError(
        mode === "invite"
          ? "Registrierung ist nur mit einer Einladung möglich. Bitte nutze den Link aus deiner Einladungs-Mail."
          : "Auf diesem Server können keine neuen Accounts angelegt werden.",
        403,
      );
    }
  }
  return { invite: useInvite };
}

export type CreatedAccount = { user: { id: string; email: string; displayName: string; emailVerifiedAt: Date | null }; bandId: string; joinedViaInvite: boolean };

/**
 * Creates the user (with password hash or – for passkey accounts – without) and their band membership.
 * `extra` runs inside the same transaction (e.g. storing the passkey).
 */
export async function createAccount(
  input: RegistrationInput & { userId?: string; passwordHash: string | null },
  invite: BandInvite | null,
  extra?: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], userId: string) => Promise<void>,
): Promise<CreatedAccount> {
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.appUser.create({
      data: {
        ...(input.userId ? { id: input.userId } : {}),
        email: input.email,
        displayName: input.displayName,
        passwordHash: input.passwordHash,
        // Invite links were delivered to this address, and without SMTP there is no way to verify.
        emailVerifiedAt: invite || emailVerificationMode() === "off" ? new Date() : null,
      },
      select: { id: true, email: true, displayName: true, emailVerifiedAt: true },
    });
    if (extra) await extra(tx, user.id);

    if (invite) {
      const guest = invite.role === "guest";
      const member = await tx.bandMember.create({ data: { bandId: invite.bandId, userId: user.id, role: guest ? "guest" : "member" } });
      if (guest) {
        // Only setlists that still exist in this band are shared.
        const setlists = await tx.setlist.findMany({ where: { bandId: invite.bandId, id: { in: invite.guestSetlistIds } }, select: { id: true } });
        await tx.guestSetlistAccess.createMany({ data: setlists.map((setlist) => ({ memberId: member.id, setlistId: setlist.id })), skipDuplicates: true });
      }
      await tx.bandInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
      return { user, bandId: invite.bandId, joinedViaInvite: true };
    }

    const bandName = input.bandName?.trim() || `${input.displayName}s Band`;
    const band = await tx.band.create({ data: { name: bandName, slug: createBandSlug(bandName) }, select: { id: true } });
    await tx.bandMember.create({ data: { bandId: band.id, userId: user.id, role: "owner" } });
    return { user, bandId: band.id, joinedViaInvite: false };
  });

  if (result.joinedViaInvite) {
    await writeAuditLog({
      bandId: result.bandId,
      actorUserId: result.user.id,
      action: "invite_accepted",
      entityType: "band_invite",
      entityId: invite?.id ?? null,
      payload: { email: input.email },
    });
    await notifyBandMembers({
      bandId: result.bandId,
      actorUserId: result.user.id,
      kind: "invite",
      type: "invite_accepted",
      title: "Neues Bandmitglied",
      body: `${input.displayName} ist der Band beigetreten.`,
    });
  }

  if (!result.user.emailVerifiedAt) {
    await sendVerificationMail(result.user);
  }
  return result;
}

/** 201 response with a fresh session for the new account. */
export async function registrationResponse(account: CreatedAccount, ipAddress: string | null, userAgent: string | null): Promise<NextResponse> {
  const token = await createSession({ userId: account.user.id, email: account.user.email }, ipAddress, userAgent);
  const response = NextResponse.json(
    {
      ok: true,
      joinedViaInvite: account.joinedViaInvite,
      user: { userId: account.user.id, email: account.user.email, defaultBandId: account.bandId },
    },
    { status: 201 },
  );
  setSessionCookie(response, token);
  setCsrfCookie(response, createCsrfToken());
  return response;
}
