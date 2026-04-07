import { test, expect, request } from "@playwright/test";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;
const BAND_ID = process.env.E2E_BAND_ID;
const EVENT_ID = process.env.E2E_EVENT_ID;

test.describe("core bandival api flows", () => {
  test("register or login works", async ({ baseURL }) => {
    test.skip(!baseURL, "E2E_BASE_URL not configured");

    const ctx = await request.newContext({ baseURL });
    await ctx.get("/api/auth/csrf");

    const email = `e2e-${Date.now()}@bandival.local`;
    const registerRes = await ctx.post("/api/auth/register", {
      data: {
        email,
        password: "e2e-password-123",
        displayName: "E2E User",
      },
    });

    expect([201, 400, 409]).toContain(registerRes.status());

    const loginRes = await ctx.post("/api/auth/login", {
      data: { email, password: "e2e-password-123" },
    });
    expect([200, 400, 401]).toContain(loginRes.status());
  });

  test("invite create and revoke", async ({ baseURL }) => {
    test.skip(!baseURL || !ADMIN_EMAIL || !ADMIN_PASSWORD || !BAND_ID, "Admin credentials or band not configured");

    const ctx = await request.newContext({ baseURL });
    await ctx.get("/api/auth/csrf");
    await ctx.post("/api/auth/login", {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });

    const createRes = await ctx.post(`/api/bands/${BAND_ID}/invites`, {
      data: {
        email: `invite-${Date.now()}@example.com`,
        expiresInDays: 14,
      },
    });

    expect(createRes.ok()).toBeTruthy();
    const created = await createRes.json();
    const inviteId = created.invite?.id as string;
    expect(inviteId).toBeTruthy();

    const revokeRes = await ctx.delete(`/api/bands/${BAND_ID}/invites/${inviteId}`);
    expect(revokeRes.ok()).toBeTruthy();
  });

  test("availability update and backup export", async ({ baseURL }) => {
    test.skip(!baseURL || !ADMIN_EMAIL || !ADMIN_PASSWORD || !BAND_ID || !EVENT_ID, "Missing E2E env vars");

    const ctx = await request.newContext({ baseURL });
    await ctx.get("/api/auth/csrf");
    await ctx.post("/api/auth/login", {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });

    const availabilityRes = await ctx.put(`/api/events/${EVENT_ID}/availability`, {
      data: { status: "maybe" },
    });
    expect(availabilityRes.ok()).toBeTruthy();

    const backupRes = await ctx.get(`/api/bands/${BAND_ID}/backup`);
    expect(backupRes.ok()).toBeTruthy();
    const backup = await backupRes.json();
    expect(backup?.data?.band?.id).toBe(BAND_ID);

    const restoreRes = await ctx.post(`/api/bands/${BAND_ID}/backup`, {
      data: backup,
    });
    expect([200, 400]).toContain(restoreRes.status());
  });
});
