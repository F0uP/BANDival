/*
 * Password rules following NIST SP 800-63B (rev. 4): length over arbitrary composition rules,
 * no common / guessable passwords, nothing derived from the account itself – plus a breach check
 * on the server (lib/password-breach.ts). Shared by the registration form (live checklist) and the API.
 */

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 256;
/** From this length a password counts as passphrase and needs no character mix. */
export const PASSPHRASE_LENGTH = 16;

const COMMON = new Set([
  "123456", "1234567", "12345678", "123456789", "1234567890", "12345", "111111", "000000", "123123", "654321", "666666", "121212",
  "password", "passwort", "password1", "passwort1", "passw0rd", "p@ssw0rd", "p@ssword", "pa$$word", "kennwort", "geheim", "secret",
  "qwerty", "qwertz", "qwertyuiop", "qwertzuiop", "asdfgh", "asdfghjkl", "yxcvbnm", "zxcvbnm", "asdf", "qwer", "1q2w3e4r", "q1w2e3r4",
  "zaq12wsx", "1qaz2wsx", "abc123", "abcdef", "iloveyou", "ichliebedich", "liebe", "love", "lovely", "schatz", "schatzi", "hallo",
  "willkommen", "welcome", "letmein", "admin", "administrator", "root", "master", "dragon", "monkey", "sunshine", "princess", "football",
  "fussball", "fußball", "baseball", "soccer", "superman", "batman", "starwars", "pokemon", "freedom", "whatever", "trustno1", "shadow",
  "michael", "daniel", "thomas", "andreas", "stefan", "alexander", "sabine", "nicole", "jennifer", "jessica", "charlie", "hunter",
  "killer", "summer", "sommer", "winter", "berlin", "hamburg", "muenchen", "münchen", "koeln", "köln", "deutschland", "germany", "bayern",
  "borussia", "schalke", "werder", "eintracht", "hertha", "computer", "internet", "google", "samsung", "apple", "iphone", "android",
  "test", "testtest", "guest", "gast", "user", "login", "changeme", "default", "mustermann", "maxmustermann", "music", "musik", "gitarre",
  "guitar", "drums", "schlagzeug", "bass", "rock", "rocknroll", "rockandroll", "metal", "punk", "band", "bandival", "konzert", "probe",
]);

const SEQUENCES = ["abcdefghijklmnopqrstuvwxyz", "0123456789", "qwertzuiopasdfghjklyxcvbnm", "qwertyuiopasdfghjklzxcvbnm", "1q2w3e4r5t6z7u8i9o0p"];

export type PasswordContext = { email?: string | null; name?: string | null; bandName?: string | null };
export type PasswordCheck = { id: "length" | "variety" | "common" | "personal"; label: string; ok: boolean };

function classes(password: string): number {
  return [/[a-zäöüß]/, /[A-ZÄÖÜ]/, /\d/, /[^A-Za-z0-9äöüßÄÖÜ]/].filter((pattern) => pattern.test(password)).length;
}

/** Common password, a keyboard/alphabet run, one repeated character – or a common word with digits/symbols around it. */
export function isGuessable(password: string): boolean {
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return true;
  const core = lower.replace(/^[^a-zäöüß]+|[^a-zäöüß]+$/g, "");
  if (core.length >= 3 && COMMON.has(core) && core.length >= lower.length - 6) return true;
  if (new Set(lower).size <= Math.max(2, Math.floor(lower.length / 4))) return true;
  return SEQUENCES.some((sequence) => lower.length >= 6 && (sequence.includes(lower) || [...sequence].reverse().join("").includes(lower)));
}

function personalTokens(context: PasswordContext): string[] {
  const local = context.email?.split("@")[0] ?? "";
  return [local, ...local.split(/[^a-zäöüß0-9]+/i), ...(context.name ?? "").split(/\s+/), ...(context.bandName ?? "").split(/\s+/), "bandival"]
    .map((token) => token.toLowerCase().trim())
    .filter((token) => token.length >= 4);
}

export function passwordChecks(password: string, context: PasswordContext = {}): PasswordCheck[] {
  const lower = password.toLowerCase();
  return [
    { id: "length", label: `Mindestens ${PASSWORD_MIN_LENGTH} Zeichen`, ok: password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH },
    { id: "variety", label: `Mix aus Groß-/Kleinbuchstaben, Zahlen, Sonderzeichen – oder Passphrase ab ${PASSPHRASE_LENGTH} Zeichen`, ok: classes(password) >= 3 || password.length >= PASSPHRASE_LENGTH },
    { id: "common", label: "Kein häufiges oder leicht zu erratendes Passwort", ok: password.length > 0 && !isGuessable(password) },
    { id: "personal", label: "Enthält nicht deinen Namen, deine E-Mail oder „Bandival“", ok: password.length > 0 && !personalTokens(context).some((token) => lower.includes(token)) },
  ];
}

/** Unfulfilled rules (empty = acceptable). */
export function passwordProblems(password: string, context: PasswordContext = {}): string[] {
  return passwordChecks(password, context).filter((check) => !check.ok).map((check) => check.label);
}

/** 0 (very weak) … 4 (very strong) – for the strength meter. */
export function passwordScore(password: string, context: PasswordContext = {}): number {
  if (!password) return 0;
  const failed = passwordProblems(password, context).length;
  if (failed > 0) return Math.max(0, 1 - (failed > 1 ? 1 : 0));
  let score = 2;
  if (password.length >= 16) score += 1;
  if (password.length >= 20 || (classes(password) === 4 && password.length >= 14)) score += 1;
  return Math.min(4, score);
}
