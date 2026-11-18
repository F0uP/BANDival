import { NextRequest, NextResponse } from "next/server";
import { isSealed, openSecret, sealSecret } from "@/lib/secret-box";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  assertLoginAllowed,
  AuthError,
  clearFailedLogin,
  createCsrfToken,
  createSession,
  getClientIp,
  registerFailedLogin,
  setCsrfCookie,
  setSessionCookie,
} from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { verifyChallenge } from "@/lib/tokens";
import { hashRecoveryCode, matchTotpStep } from "@/lib/totp";

const schema = z.object({
  challenge: z.string().min(10).max(300),
  code: z.string().trim().min(6).max(20),
});

/** Second login step: TOTP code from the authenticator app or a one-time recovery code. */
export async function POST(request: NextRequest) {
  try {
    const payload = schema.parse(await request.json());
    const userId = verifyChallenge(payload.challenge);
    const ip = getClientIp(request);
    const user = await prisma.appUser.findUnique({ where: { id: userId } });
    if (!user?.totpSecret || !user.totpEnabledAt) {
      throw new AuthError("Zwei-Faktor-Anmeldung ist nicht aktiv.", 400);
    }
    await assertLoginAllowed(`2fa:${user.email}`, ip);

    const secret = openSecret(user.totpSecret);
    const step = secret ? matchTotpStep(secret, payload.code) : null;
    // Replay protection: every time step can be used only once.
    let ok = step !== null && step > (user.totpLastStep ?? -1);
    if (ok && step !== null) {
      await prisma.appUser.update({
        where: { id: user.id },
        data: { totpLastStep: step, ...(isSealed(user.totpSecret) ? {} : { totpSecret: sealSecret(secret as string) }) },
      });
    }
    if (!ok && payload.code.includes("-")) {
      const used = await prisma.twoFactorRecoveryCode.updateMany({
        where: { userId, codeHash: hashRecoveryCode(payload.code), usedAt: null },
        data: { usedAt: new Date() },
      });
      ok = used.count === 1;
    }
    if (!ok) {
      await registerFailedLogin(`2fa:${user.email}`, ip);
      throw new AuthError("Der Code ist falsch oder abgelaufen.", 401);
    }
    await clearFailedLogin(`2fa:${user.email}`, ip);

    const token = await createSession({ userId: user.id, email: user.email }, ip, request.headers.get("user-agent"));
    const response = NextResponse.json({ ok: true });
    setSessionCookie(response, token);
    setCsrfCookie(response, createCsrfToken());
    return response;
  } catch (error) {
    return errorResponse(error, "Anmeldung fehlgeschlagen.");
  }
}
