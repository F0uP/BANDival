import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { prisma } from "@/lib/prisma";
import { AuthError } from "@/lib/auth";
import { getAppBaseUrl } from "@/lib/mailer";

/*
 * Passkeys (WebAuthn / FIDO2): phishing-resistant sign-in with fingerprint, face or device PIN.
 * User verification is required, so a passkey counts as two factors (no TOTP on top).
 */

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

/** Relying party = our domain. The Android app signs in with the same passkeys (origin = its signing key hash). */
export function relyingParty(request: NextRequest): { rpID: string; rpName: string; origins: string[] } {
  const base = new URL(process.env.APP_BASE_URL ? getAppBaseUrl() : request.nextUrl.origin);
  const origins = [base.origin];
  // The Android app's origin is the base64url SHA-256 of its signing certificate – derived from the same
  // fingerprint that /.well-known/assetlinks.json publishes (ANDROID_CERT_SHA256), so one setting is enough.
  for (const fingerprint of (process.env.ANDROID_CERT_SHA256 ?? "").split(",")) {
    const hex = fingerprint.trim().replace(/:/g, "");
    if (/^[0-9a-fA-F]{64}$/.test(hex)) origins.push(`android:apk-key-hash:${Buffer.from(hex, "hex").toString("base64url")}`);
  }
  const apkHash = process.env.ANDROID_APK_KEY_HASH?.trim();
  if (apkHash) origins.push(apkHash.startsWith("android:apk-key-hash:") ? apkHash : `android:apk-key-hash:${apkHash}`);
  return { rpID: base.hostname, rpName: "Bandival", origins };
}

type Purpose = "login" | "register-account" | "add-passkey";

async function storeChallenge(challenge: string, purpose: Purpose, data: { userId?: string | null; payload?: Record<string, unknown> } = {}): Promise<string> {
  await prisma.webAuthnChallenge.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  const row = await prisma.webAuthnChallenge.create({
    data: {
      challenge,
      purpose,
      userId: data.userId ?? null,
      payload: (data.payload ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    },
    select: { id: true },
  });
  return row.id;
}

/** Challenges are single use: deleted on first use, whether the ceremony succeeds or not. */
export async function consumeChallenge(id: string, purpose: Purpose) {
  const row = await prisma.webAuthnChallenge.findUnique({ where: { id } });
  if (row) await prisma.webAuthnChallenge.delete({ where: { id } }).catch(() => undefined);
  if (!row || row.purpose !== purpose || row.expiresAt < new Date()) {
    throw new AuthError("Die Passkey-Anfrage ist abgelaufen – bitte noch einmal versuchen.", 400);
  }
  return row;
}

function userHandle(userId: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(Buffer.from(userId.replace(/-/g, ""), "hex"));
}

export async function registrationOptions(
  request: NextRequest,
  user: { id: string; email: string; displayName: string },
  purpose: "register-account" | "add-passkey",
  payload?: Record<string, unknown>,
): Promise<{ challengeId: string; options: PublicKeyCredentialCreationOptionsJSON }> {
  const { rpID, rpName } = relyingParty(request);
  const existing = await prisma.passkey.findMany({ where: { userId: user.id }, select: { credentialId: true, transports: true } });
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: user.email,
    userDisplayName: user.displayName,
    userID: userHandle(user.id),
    attestationType: "none",
    excludeCredentials: existing.map((entry) => ({ id: entry.credentialId, transports: entry.transports as AuthenticatorTransportFuture[] })),
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  });
  const challengeId = await storeChallenge(options.challenge, purpose, { userId: purpose === "add-passkey" ? user.id : null, payload: { ...payload, userId: user.id } });
  return { challengeId, options };
}

export type VerifiedPasskey = {
  credentialId: string;
  publicKey: Uint8Array<ArrayBuffer>;
  counter: number;
  transports: string[];
  deviceType: string;
  backedUp: boolean;
};

export async function verifyRegistration(request: NextRequest, challenge: string, response: RegistrationResponseJSON): Promise<VerifiedPasskey> {
  const { rpID, origins } = relyingParty(request);
  let verification;
  try {
    verification = await verifyRegistrationResponse({ response, expectedChallenge: challenge, expectedOrigin: origins, expectedRPID: rpID, requireUserVerification: true });
  } catch (error) {
    throw new AuthError(`Passkey konnte nicht geprüft werden: ${error instanceof Error ? error.message : "unbekannter Fehler"}`, 400);
  }
  if (!verification.verified) throw new AuthError("Passkey konnte nicht bestätigt werden.", 400);
  const info = verification.registrationInfo;
  return {
    credentialId: info.credential.id,
    publicKey: new Uint8Array(info.credential.publicKey),
    counter: info.credential.counter,
    transports: info.credential.transports ?? response.response.transports ?? [],
    deviceType: info.credentialDeviceType,
    backedUp: info.credentialBackedUp,
  };
}

/** Friendly default name from the browser's user agent ("Chrome auf Android", …). */
export function passkeyName(userAgent: string | null): string {
  const ua = userAgent ?? "";
  const platform = /Android/i.test(ua) ? "Android" : /iPhone|iPad/i.test(ua) ? "iPhone/iPad" : /Mac OS/i.test(ua) ? "Mac" : /Windows/i.test(ua) ? "Windows" : /Linux/i.test(ua) ? "Linux" : "Gerät";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /Bandival/i.test(ua) ? "Bandival-App" : "Browser";
  return `${browser} auf ${platform}`;
}

export async function storePasskey(tx: Prisma.TransactionClient | typeof prisma, userId: string, passkey: VerifiedPasskey, name: string) {
  return tx.passkey.create({
    data: {
      userId,
      credentialId: passkey.credentialId,
      publicKey: passkey.publicKey,
      counter: BigInt(passkey.counter),
      transports: passkey.transports,
      deviceType: passkey.deviceType,
      backedUp: passkey.backedUp,
      name: name.slice(0, 80),
    },
    select: { id: true, name: true, createdAt: true },
  });
}

export async function authenticationOptions(request: NextRequest): Promise<{ challengeId: string; options: PublicKeyCredentialRequestOptionsJSON }> {
  const { rpID } = relyingParty(request);
  // Discoverable credentials: the browser/phone offers the matching passkeys, no e-mail needed.
  const options = await generateAuthenticationOptions({ rpID, userVerification: "required", allowCredentials: [] });
  return { challengeId: await storeChallenge(options.challenge, "login"), options };
}

/** Verifies a passkey sign-in and returns the user; the signature counter protects against cloned authenticators. */
export async function verifyAuthentication(request: NextRequest, challengeId: string, response: AuthenticationResponseJSON) {
  const challenge = await consumeChallenge(challengeId, "login");
  const passkey = await prisma.passkey.findUnique({ where: { credentialId: response.id }, include: { user: { select: { id: true, email: true } } } });
  if (!passkey) throw new AuthError("Dieser Passkey ist hier nicht (mehr) registriert.", 401);
  const { rpID, origins } = relyingParty(request);
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: origins,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: passkey.credentialId,
        publicKey: new Uint8Array(passkey.publicKey),
        counter: Number(passkey.counter),
        transports: passkey.transports as AuthenticatorTransportFuture[],
      },
    });
  } catch {
    throw new AuthError("Anmeldung mit Passkey fehlgeschlagen.", 401);
  }
  if (!verification.verified) throw new AuthError("Anmeldung mit Passkey fehlgeschlagen.", 401);
  await prisma.passkey.update({
    where: { id: passkey.id },
    data: { counter: BigInt(verification.authenticationInfo.newCounter), lastUsedAt: new Date(), backedUp: verification.authenticationInfo.credentialBackedUp },
  });
  return passkey.user;
}
