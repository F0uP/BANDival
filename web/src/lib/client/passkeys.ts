"use client";

import { browserSupportsWebAuthn, startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { api } from "@/lib/client/api";

type RequestOptions = Parameters<typeof startAuthentication>[0]["optionsJSON"];
type CreationOptions = Parameters<typeof startRegistration>[0]["optionsJSON"];

/** Passkeys need WebAuthn and a secure context (https or localhost). */
export function passkeysSupported(): boolean {
  return typeof window !== "undefined" && window.isSecureContext && browserSupportsWebAuthn();
}

/** Human-readable message for the typical WebAuthn errors. */
export function passkeyErrorMessage(error: unknown): string {
  const name = (error as { name?: string } | null)?.name;
  if (name === "NotAllowedError" || name === "AbortError") return "Passkey-Abfrage abgebrochen oder abgelaufen.";
  if (name === "InvalidStateError") return "Auf diesem Gerät ist bereits ein Passkey für deinen Account gespeichert.";
  if (name === "SecurityError") return "Passkeys funktionieren nur über https (oder localhost) mit der richtigen Server-Adresse.";
  return error instanceof Error && error.message ? error.message : "Passkey fehlgeschlagen.";
}

export async function signInWithPasskey(): Promise<void> {
  const { challengeId, options } = await api.post<{ challengeId: string; options: RequestOptions }>("/api/auth/passkey", { step: "options" });
  const response = await startAuthentication({ optionsJSON: options });
  await api.post("/api/auth/passkey", { step: "verify", challengeId, response });
}

export async function signUpWithPasskey(account: { email: string; displayName: string; bandName: string | null; inviteToken: string | null }): Promise<void> {
  const { challengeId, options } = await api.post<{ challengeId: string; options: CreationOptions }>("/api/auth/register/passkey", { step: "options", ...account });
  const response = await startRegistration({ optionsJSON: options });
  await api.post("/api/auth/register/passkey", { step: "verify", challengeId, response });
}

export async function addPasskey(name?: string): Promise<void> {
  const { challengeId, options } = await api.post<{ challengeId: string; options: CreationOptions }>("/api/account/passkeys", { step: "options" });
  const response = await startRegistration({ optionsJSON: options });
  await api.post("/api/account/passkeys", { step: "verify", challengeId, response, name });
}
