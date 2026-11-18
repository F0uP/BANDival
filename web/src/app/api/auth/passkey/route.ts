import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import {
  assertLoginAllowed,
  clearFailedLogin,
  createCsrfToken,
  createSession,
  getClientIp,
  registerFailedLogin,
  setCsrfCookie,
  setSessionCookie,
  writeAuditLog,
} from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { authenticationOptions, verifyAuthentication } from "@/lib/passkeys";

const schema = z.discriminatedUnion("step", [
  z.object({ step: z.literal("options") }),
  z.object({ step: z.literal("verify"), challengeId: z.string().uuid(), response: z.record(z.string(), z.unknown()) }),
]);

/** Sign in with a passkey (user verification required → counts as two factors). */
export async function POST(request: NextRequest) {
  try {
    const payload = schema.parse(await request.json());
    const ip = getClientIp(request);
    if (payload.step === "options") {
      return NextResponse.json(await authenticationOptions(request));
    }
    await assertLoginAllowed("passkey", ip);
    let user;
    try {
      user = await verifyAuthentication(request, payload.challengeId, payload.response as unknown as AuthenticationResponseJSON);
    } catch (error) {
      await registerFailedLogin("passkey", ip);
      throw error;
    }
    await clearFailedLogin("passkey", ip);
    const token = await createSession({ userId: user.id, email: user.email }, ip, request.headers.get("user-agent"));
    const response = NextResponse.json({ ok: true });
    setSessionCookie(response, token);
    setCsrfCookie(response, createCsrfToken());
    const membership = await (await import("@/lib/prisma")).prisma.bandMember.findFirst({ where: { userId: user.id }, select: { bandId: true } });
    if (membership) {
      await writeAuditLog({ bandId: membership.bandId, actorUserId: user.id, action: "passkey_login", entityType: "user", entityId: user.id, payload: {} }).catch(() => undefined);
    }
    return response;
  } catch (error) {
    return errorResponse(error, "Anmeldung mit Passkey fehlgeschlagen.");
  }
}
