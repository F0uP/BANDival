import { expect, request, test } from "@playwright/test";

test.describe("settings flow api", () => {
  test("profile/member/password flow for fresh owner", async ({ baseURL }) => {
    test.skip(!baseURL, "E2E_BASE_URL not configured");

    const ctx = await request.newContext({ baseURL });
    await ctx.get("/api/auth/csrf");

    const email = `settings-e2e-${Date.now()}@bandival.local`;
    const initialPassword = "settings-e2e-password-123";
    const nextPassword = "settings-e2e-password-456";

    const registerRes = await ctx.post("/api/auth/register", {
      data: {
        email,
        password: initialPassword,
        displayName: "Settings E2E",
      },
    });
    expect(registerRes.status()).toBe(201);

    const meRes = await ctx.get("/api/auth/me");
    expect(meRes.ok()).toBeTruthy();
    const meData = await meRes.json();
    const bandId = meData.user?.defaultBandId as string;
    expect(bandId).toBeTruthy();

    const membersRes = await ctx.get(`/api/bands/${bandId}/members`);
    expect(membersRes.ok()).toBeTruthy();
    const membersData = await membersRes.json();
    const selfMember = (membersData.members as Array<{ id: string; user: { email: string } }>).find((member) => member.user.email === email);
    expect(selfMember?.id).toBeTruthy();

    const profilePatch = await ctx.patch(`/api/bands/${bandId}/members/me`, {
      data: {
        displayName: "Settings E2E Updated",
        instrumentPrimary: "Guitar",
      },
    });
    expect(profilePatch.ok()).toBeTruthy();

    const demoteLastOwner = await ctx.patch(`/api/bands/${bandId}/members/${selfMember?.id}`, {
      data: {
        role: "member",
      },
    });
    expect(demoteLastOwner.status()).toBe(409);

    const passwordPatch = await ctx.patch("/api/account/password", {
      data: {
        currentPassword: initialPassword,
        newPassword: nextPassword,
      },
    });
    expect(passwordPatch.ok()).toBeTruthy();

    const freshLoginCtx = await request.newContext({ baseURL });
    await freshLoginCtx.get("/api/auth/csrf");
    const loginRes = await freshLoginCtx.post("/api/auth/login", {
      data: {
        email,
        password: nextPassword,
      },
    });
    expect(loginRes.ok()).toBeTruthy();
  });
});
