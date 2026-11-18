import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AuthError, requireAuthUser, revokeOtherSessions, SESSION_COOKIE_NAME } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { assertAcceptablePassword } from "@/lib/password-breach";
import { PASSWORD_MAX_LENGTH } from "@/lib/password-policy";

const schema = z.object({
  /** Not needed for passkey-only accounts that set their first password. */
  currentPassword: z.string().max(PASSWORD_MAX_LENGTH).optional().default(""),
  newPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const payload = schema.parse(await request.json());

    const user = await prisma.appUser.findUnique({ where: { id: session.userId } });
    if (!user) throw new AuthError("Nicht angemeldet.", 401);

    if (user.passwordHash) {
      const isValid = await bcrypt.compare(payload.currentPassword, user.passwordHash);
      if (!isValid) {
        throw new AuthError("Das aktuelle Passwort ist falsch.", 403);
      }
    }
    await assertAcceptablePassword(payload.newPassword, { email: user.email, name: user.displayName });

    const nextHash = await bcrypt.hash(payload.newPassword, 12);
    await prisma.appUser.update({ where: { id: session.userId }, data: { passwordHash: nextHash } });

    // Sign out all other devices after a password change.
    await revokeOtherSessions(session.userId, request.cookies.get(SESSION_COOKIE_NAME)?.value);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Passwort konnte nicht geändert werden.");
  }
}
