import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { getClientIp } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { consumeChallenge, passkeyName, registrationOptions, storePasskey, verifyRegistration } from "@/lib/passkeys";
import { createAccount, prepareRegistration, registrationResponse } from "@/lib/registration";

const accountSchema = z.object({
  email: z.string().trim().toLowerCase().email("Bitte eine gültige E-Mail-Adresse eingeben."),
  displayName: z.string().trim().min(1, "Bitte einen Namen angeben.").max(100),
  bandName: z.string().trim().max(160).optional().nullable(),
  inviteToken: z.string().trim().min(8).max(500).optional().nullable(),
});

const schema = z.discriminatedUnion("step", [
  accountSchema.extend({ step: z.literal("options") }),
  z.object({ step: z.literal("verify"), challengeId: z.string().uuid(), response: z.record(z.string(), z.unknown()) }),
]);

/** Passwordless sign-up: the account is created together with its first passkey. */
export async function POST(request: NextRequest) {
  try {
    const payload = schema.parse(await request.json());
    const ipAddress = getClientIp(request);

    if (payload.step === "options") {
      const { step: _step, ...account } = payload;
      void _step;
      await prepareRegistration(account, ipAddress);
      const userId = randomUUID();
      const result = await registrationOptions(request, { id: userId, email: account.email, displayName: account.displayName }, "register-account", account);
      return NextResponse.json(result);
    }

    const challenge = await consumeChallenge(payload.challengeId, "register-account");
    const data = accountSchema.extend({ userId: z.string().uuid() }).parse(challenge.payload);
    // Checked again: the address could have been taken during the ceremony.
    const { invite } = await prepareRegistration(data, ipAddress);
    const passkey = await verifyRegistration(request, challenge.challenge, payload.response as unknown as RegistrationResponseJSON);
    const userAgent = request.headers.get("user-agent");
    const account = await createAccount({ ...data, passwordHash: null }, invite, async (tx, userId) => {
      await storePasskey(tx, userId, passkey, passkeyName(userAgent));
    });
    return await registrationResponse(account, ipAddress, userAgent);
  } catch (error) {
    return errorResponse(error, "Registrierung mit Passkey fehlgeschlagen.");
  }
}
