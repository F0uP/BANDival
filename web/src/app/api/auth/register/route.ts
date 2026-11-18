import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { z } from "zod";
import { getClientIp } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { assertAcceptablePassword } from "@/lib/password-breach";
import { PASSWORD_MAX_LENGTH } from "@/lib/password-policy";
import { createAccount, prepareRegistration, registrationResponse } from "@/lib/registration";

const schema = z.object({
  email: z.string().trim().toLowerCase().email("Bitte eine gültige E-Mail-Adresse eingeben."),
  password: z.string().min(1, "Bitte ein Passwort angeben.").max(PASSWORD_MAX_LENGTH),
  displayName: z.string().trim().min(1, "Bitte einen Namen angeben.").max(100),
  bandName: z.string().trim().max(160).optional().nullable(),
  inviteToken: z.string().trim().min(8).max(500).optional().nullable(),
});

export async function POST(request: NextRequest) {
  try {
    const payload = schema.parse(await request.json());
    const ipAddress = getClientIp(request);
    const { invite } = await prepareRegistration(payload, ipAddress);
    await assertAcceptablePassword(payload.password, { email: payload.email, name: payload.displayName, bandName: payload.bandName });
    const passwordHash = await bcrypt.hash(payload.password, 12);
    const account = await createAccount({ ...payload, passwordHash }, invite);
    return await registrationResponse(account, ipAddress, request.headers.get("user-agent"));
  } catch (error) {
    return errorResponse(error, "Registrierung fehlgeschlagen.");
  }
}
