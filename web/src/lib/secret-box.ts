import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/*
 * Server secret handling:
 * - AUTH_SECRET must be long and random (sessions, tokens and encryption keys are derived from it)
 * - secrets that must be readable again (TOTP keys) are stored encrypted with AES-256-GCM
 */

const MIN_SECRET_LENGTH = 32;
const PREFIX = "enc:v1:";

export class ConfigurationError extends Error {}

export function authSecret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new ConfigurationError("AUTH_SECRET ist nicht konfiguriert (z. B. `openssl rand -base64 48`).");
  if (value.length < MIN_SECRET_LENGTH) {
    throw new ConfigurationError(`AUTH_SECRET ist zu kurz – mindestens ${MIN_SECRET_LENGTH} zufällige Zeichen (z. B. \`openssl rand -base64 48\`).`);
  }
  return value;
}

function encryptionKey(): Buffer {
  return Buffer.from(hkdfSync("sha256", authSecret(), "bandival", "secret-box:v1", 32));
}

/** Encrypts a secret for storage in the database. */
export function sealSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url");
}

/** Decrypts a stored secret; legacy plaintext values are returned as they are. Null if it cannot be decrypted. */
export function openSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (!stored.startsWith(PREFIX)) return stored;
  try {
    const raw = Buffer.from(stored.slice(PREFIX.length), "base64url");
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function isSealed(stored: string | null | undefined): boolean {
  return Boolean(stored?.startsWith(PREFIX));
}
