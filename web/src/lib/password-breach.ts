import { createHash } from "node:crypto";
import { HttpError } from "@/lib/http";
import { passwordProblems, type PasswordContext } from "@/lib/password-policy";

/**
 * Checks a password against the "Have I Been Pwned" breach corpus with k-anonymity:
 * only the first 5 characters of its SHA-1 hash leave the server, the response is padded.
 * Returns how often it appeared, or null if the check is disabled/unavailable (fail-open for offline instances).
 */
export async function breachCount(password: string): Promise<number | null> {
  if (process.env.PASSWORD_BREACH_CHECK === "false") return null;
  const hash = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  try {
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true", "User-Agent": "Bandival-Password-Check" },
      signal: AbortSignal.timeout(2500),
      cache: "no-store",
    });
    if (!response.ok) return null;
    for (const line of (await response.text()).split("\n")) {
      const [candidate, count] = line.trim().split(":");
      if (candidate === suffix) return Number(count) || 0;
    }
    return 0;
  } catch {
    return null;
  }
}

/** Server-side password validation for registration, reset and change (400 with the reasons). */
export async function assertAcceptablePassword(password: string, context: PasswordContext = {}): Promise<void> {
  const problems = passwordProblems(password, context);
  if (problems.length) throw new HttpError(`Passwort zu schwach: ${problems.join(" · ")}.`, 400);
  const breaches = await breachCount(password);
  if (breaches && breaches > 0) {
    throw new HttpError(`Dieses Passwort ist in bekannten Datenlecks aufgetaucht (${breaches.toLocaleString("de-DE")}×) – bitte wähle ein anderes.`, 400);
  }
}
