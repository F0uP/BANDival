import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
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
import { signChallenge } from "@/lib/tokens";

const schema = z.object({
  email: z.string().trim().toLowerCase().email("Bitte eine gültige E-Mail-Adresse eingeben."),
  password: z.string().min(1, "Bitte Passwort eingeben.").max(300),
});

let dummyHash: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHash ??= bcrypt.hash("bandival-timing-dummy", 12);
  return dummyHash;
}

export async function POST(request: NextRequest) {
  try {
    const payload = schema.parse(await request.json());
    const ipAddress = getClientIp(request);
    const userAgent = request.headers.get("user-agent");

    await assertLoginAllowed(payload.email, ipAddress);

    const user = await prisma.appUser.findUnique({ where: { email: payload.email } });

    // Always run bcrypt to keep timing similar for unknown accounts.
    const passwordOk = await bcrypt.compare(payload.password, user?.passwordHash ?? (await getDummyHash()));

    if (!user?.passwordHash || !passwordOk) {
      await registerFailedLogin(payload.email, ipAddress);
      throw new AuthError("E-Mail oder Passwort ist falsch.", 401);
    }

    await clearFailedLogin(payload.email, ipAddress);

    if (user.totpEnabledAt && user.totpSecret) {
      // Second factor required – no session yet, only a short-lived signed challenge.
      return NextResponse.json({ twoFactorRequired: true, challenge: signChallenge(user.id) });
    }

    const token = await createSession({ userId: user.id, email: user.email }, ipAddress, userAgent);

    const response = NextResponse.json({
      ok: true,
      user: { userId: user.id, email: user.email, displayName: user.displayName },
    });
    setSessionCookie(response, token);
    setCsrfCookie(response, createCsrfToken());
    return response;
  } catch (error) {
    return errorResponse(error, "Anmeldung fehlgeschlagen.");
  }
}
