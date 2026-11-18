import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";
import { authSecret } from "@/lib/secret-box";

/** RFC 6238 TOTP (SHA-1, 30 s, 6 digits) – compatible with all common authenticator apps. */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    value = (value << 5) | ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

function hotp(secret: Buffer, counter: number): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", secret).update(message).digest();
  const offset = digest[digest.length - 1] & 0xf;
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, "0");
}

export function totpNow(secret: string, at = Date.now()): string {
  return hotp(base32Decode(secret), Math.floor(at / 30_000));
}

/** Accepts the current code and one step before/after to tolerate clock drift. */
export function verifyTotp(secret: string, code: string, at = Date.now()): boolean {
  return matchTotpStep(secret, code, at) !== null;
}

/** Time step of a valid code (for replay protection: a step may only be used once), or null. */
export function matchTotpStep(secret: string, code: string, at = Date.now()): number | null {
  const normalized = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(normalized)) return null;
  const key = base32Decode(secret);
  const step = Math.floor(at / 30_000);
  for (const delta of [-1, 0, 1]) {
    if (hotp(key, step + delta) === normalized) return step + delta;
  }
  return null;
}

export function otpauthUrl(secret: string, account: string, issuer = "Bandival"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

/* Recovery codes ------------------------------------------------------------ */

const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function generateRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const chars = Array.from({ length: 10 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
    return `${chars.slice(0, 5)}-${chars.slice(5)}`;
  });
}

export function hashRecoveryCode(code: string): string {
  return createHash("sha256")
    .update(`${authSecret()}:recovery:${code.trim().toLowerCase().replace(/\s/g, "")}`)
    .digest("hex");
}
