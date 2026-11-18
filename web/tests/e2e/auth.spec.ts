import { expect, test } from "@playwright/test";
import { ApiClient, PASSWORD, registerUser, uniqueEmail } from "./helpers";

test.describe("auth", () => {
  test("health endpoint reports a working database", async ({ baseURL }) => {
    const api = await ApiClient.create(baseURL!);
    const health = await api.json<{ app: string; ok: boolean }>(api.get("/api/health"));
    expect(health.app).toBe("bandival");
    expect(health.ok).toBe(true);
  });

  test("register, logout, wrong password, login", async ({ baseURL }) => {
    const { api, email, bands } = await registerUser(baseURL!, { bandName: "The Testers" });
    expect(bands).toHaveLength(1);
    expect(bands[0].name).toBe("The Testers");
    expect(bands[0].role).toBe("owner");

    await api.json(api.post("/api/auth/logout"));
    expect((await api.get("/api/auth/me")).status()).toBe(401);

    const fresh = await ApiClient.create(baseURL!);
    await fresh.json(fresh.post("/api/auth/login", { email, password: "definitely-wrong" }), 401);
    await fresh.json(fresh.post("/api/auth/login", { email: ` ${email.toUpperCase()} `, password: PASSWORD }));
    const me = await fresh.json<{ user: { email: string } }>(fresh.get("/api/auth/me"));
    expect(me.user.email).toBe(email);
  });

  test("duplicate registration is rejected", async ({ baseURL }) => {
    const email = uniqueEmail("dup");
    await registerUser(baseURL!, { email });
    const other = await ApiClient.create(baseURL!);
    await other.json(other.post("/api/auth/register", { email, password: PASSWORD, displayName: "Dup" }), 409);
  });

  test("requests without CSRF token are rejected", async ({ baseURL }) => {
    const { api } = await registerUser(baseURL!);
    const response = await api.ctx.post("/api/bands", { data: { name: "No CSRF" } });
    expect(response.status()).toBe(403);
  });

  test("unauthenticated API access is rejected", async ({ baseURL }) => {
    const api = await ApiClient.create(baseURL!);
    expect((await api.get("/api/songs?bandId=00000000-0000-4000-8000-000000000000")).status()).toBe(401);
  });
});
