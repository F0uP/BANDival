import { expect, test } from "@playwright/test";
import { ApiClient, registerUser, uniqueEmail } from "./helpers";

test.describe("authentication hardening", () => {
  test("password rules: too short, guessable, personal and breached passwords are rejected", async ({ baseURL }) => {
    const client = await ApiClient.create(baseURL!);
    const attempt = (password: string, displayName = "Robin Tester") =>
      client.post("/api/auth/register", { email: uniqueEmail("weak"), password, displayName, bandName: null });

    expect((await attempt("Kurz-1!")).status()).toBe(400);
    expect((await attempt("Passwort2024!")).status()).toBe(400); // common word + digits
    expect((await attempt("123456789012345")).status()).toBe(400); // sequence
    expect((await attempt("Robin-ist-der-Beste-42")).status()).toBe(400); // contains the name
    const message = await (await attempt("Bandival-Rockt-2026")).json();
    expect(message.error).toContain("Bandival");

    // Known breached password (xkcd 936) – only rejected when the breach check is reachable (fail-open offline).
    const breached = await attempt("Tr0ub4dour&3");
    if (process.env.PASSWORD_BREACH_CHECK !== "false" && breached.status() === 400) {
      expect((await breached.json()).error).toContain("Datenlecks");
    }

    // A long passphrase without special characters is fine.
    expect((await attempt("grüne gitarren klingen nachts viel besser")).status()).toBe(201);
  });

  test("passkey endpoints issue single-use challenges and refuse taken addresses", async ({ baseURL }) => {
    const client = await ApiClient.create(baseURL!);
    const login = await client.json<{ challengeId: string; options: { challenge: string; rpId: string; userVerification: string } }>(client.post("/api/auth/passkey", { step: "options" }));
    expect(login.options.challenge.length).toBeGreaterThan(20);
    expect(login.options.rpId).toBe(new URL(baseURL!).hostname);
    expect(login.options.userVerification).toBe("required");

    const signup = await client.json<{ options: { user: { name: string }; authenticatorSelection: { residentKey: string } } }>(
      client.post("/api/auth/register/passkey", { step: "options", email: uniqueEmail("pk"), displayName: "Passkey Person" }),
    );
    expect(signup.options.authenticatorSelection.residentKey).toBe("required");

    const existing = await registerUser(baseURL!);
    await client.json(client.post("/api/auth/register/passkey", { step: "options", email: existing.email, displayName: "Dup" }), 409);

    // A forged response with an unknown challenge is rejected.
    await client.json(client.post("/api/auth/passkey", { step: "verify", challengeId: "00000000-0000-4000-8000-000000000000", response: { id: "x" } }), 400);

    const list = await existing.api.json<{ passkeys: unknown[]; hasPassword: boolean }>(existing.api.get("/api/account/passkeys"));
    expect(list).toEqual({ passkeys: [], hasPassword: true });
  });

  test("security headers, CSP nonce and asset links", async ({ baseURL }) => {
    const client = await ApiClient.create(baseURL!);
    const page = await client.get("/login");
    const csp = page.headers()["content-security-policy"] ?? "";
    expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(page.headers()["x-content-type-options"]).toBe("nosniff");
    const html = await page.text();
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    expect(html).toContain(`nonce="${nonce}"`);
    // Every request gets a fresh nonce.
    const again = (await client.get("/login")).headers()["content-security-policy"];
    expect(again).not.toBe(csp);

    const links = await client.json<unknown[]>(client.get("/.well-known/assetlinks.json"));
    expect(Array.isArray(links)).toBe(true);
  });
});
