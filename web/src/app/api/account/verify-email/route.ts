import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthError, requireAuthUser } from "@/lib/auth";
import { sendVerificationMail } from "@/lib/account-mail";
import { errorResponse } from "@/lib/http";
import { isMailConfigured } from "@/lib/mailer";

/** Re-sends the verification e-mail. */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const user = await prisma.appUser.findUnique({ where: { id: session.userId }, select: { id: true, email: true, displayName: true, emailVerifiedAt: true } });
    if (!user) throw new AuthError("Nicht angemeldet.", 401);
    if (user.emailVerifiedAt) return NextResponse.json({ ok: true, alreadyVerified: true });
    if (!isMailConfigured()) throw new AuthError("Auf diesem Server ist kein Mailversand eingerichtet.", 400);
    const result = await sendVerificationMail(user);
    if (!result.sent) throw new AuthError(result.reason ?? "Mail konnte nicht gesendet werden.", 502);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
