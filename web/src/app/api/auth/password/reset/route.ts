import bcrypt from "bcryptjs";
import { assertAcceptablePassword } from "@/lib/password-breach";
import { PASSWORD_MAX_LENGTH } from "@/lib/password-policy";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/http";
import { consumeUserToken } from "@/lib/tokens";

const schema = z.object({
  token: z.string().min(10).max(200),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

export async function POST(request: NextRequest) {
  try {
    const payload = schema.parse(await request.json());
    const userId = await consumeUserToken(payload.token, "password_reset");
    const account = await prisma.appUser.findUnique({ where: { id: userId }, select: { email: true, displayName: true } });
    await assertAcceptablePassword(payload.password, { email: account?.email, name: account?.displayName });
    const passwordHash = await bcrypt.hash(payload.password, 12);

    await prisma.$transaction([
      prisma.appUser.update({
        where: { id: userId },
        // The link reached the mailbox, so the address is verified as well.
        data: { passwordHash, emailVerifiedAt: new Date() },
      }),
      prisma.authSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Passwort konnte nicht zurückgesetzt werden.");
  }
}
