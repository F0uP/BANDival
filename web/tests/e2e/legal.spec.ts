import { expect, test } from "@playwright/test";
import { ApiClient, PASSWORD, registerUser } from "./helpers";

// Matches INSTANCE_ADMIN_EMAILS of the e2e environment (CI workflow / local test env).
const ADMIN_EMAIL = "legal-admin@bandival.test";

async function adminClient(baseURL: string): Promise<ApiClient> {
  const api = await ApiClient.create(baseURL);
  const registered = await api.post("/api/auth/register", { email: ADMIN_EMAIL, password: PASSWORD, displayName: "Instance Admin", bandName: null, inviteToken: null });
  if (registered.status() !== 201) await api.json(api.post("/api/auth/login", { email: ADMIN_EMAIL, password: PASSWORD }));
  return api;
}

test.describe("legal pages & cookie notice", () => {
  test.use({ locale: "de-DE" });

  test("templates are public and only instance admins can edit them", async ({ baseURL, page }) => {
    const admin = await adminClient(baseURL!);
    // Start from the templates (an earlier, aborted run may have left a custom text behind).
    for (const slug of ["impressum", "datenschutz", "agb"]) await admin.json(admin.put("/api/admin/legal", { slug, content: null }));

    const anonymous = await ApiClient.create(baseURL!);
    for (const [path, marker] of [["/impressum", "§ 5 DDG"], ["/datenschutz", "bandival_session"], ["/agb", "Geltungsbereich"]] as const) {
      const response = await anonymous.get(path);
      expect(response.status(), path).toBe(200);
      expect(await response.text(), path).toContain(marker);
    }

    const { api: member } = await registerUser(baseURL!);
    const me = await member.json<{ user: { instanceAdmin?: boolean } }>(member.get("/api/auth/me"));
    expect(me.user.instanceAdmin).toBeFalsy();
    await member.json(member.get("/api/admin/legal"), 403);
    await member.json(member.put("/api/admin/legal", { slug: "impressum", content: "# Gekapert" }), 403);

    const adminMe = await admin.json<{ user: { instanceAdmin?: boolean } }>(admin.get("/api/auth/me"));
    expect(adminMe.user.instanceAdmin).toBe(true);
    const before = await admin.json<{ pages: Array<{ slug: string; custom: boolean }>; cookieBanner: boolean }>(admin.get("/api/admin/legal"));
    expect(before.pages.map((entry) => entry.slug)).toEqual(["impressum", "datenschutz", "agb"]);

    const marker = `Musterband GbR ${Date.now()}`;
    const saved = await admin.json<{ pages: Array<{ slug: string; custom: boolean; content: string }> }>(
      admin.put("/api/admin/legal", { slug: "impressum", content: `# Impressum\n\n${marker}\n<script>alert(1)</script>\n[böser Link](javascript:alert(1))` }),
    );
    expect(saved.pages.find((entry) => entry.slug === "impressum")?.custom).toBe(true);

    await page.goto(`${baseURL}/impressum`);
    await expect(page.getByText(marker)).toBeVisible();
    // Markdown is rendered as text – no HTML, no javascript: links.
    await expect(page.locator("article script")).toHaveCount(0);
    await expect(page.locator('article a[href^="javascript"]')).toHaveCount(0);
    await expect(page.getByText("<script>alert(1)</script>")).toBeVisible();

    // Cookie notice: shown once, the choice is stored as a necessary cookie.
    const banner = page.getByRole("dialog", { name: /Cookies/ });
    await expect(banner).toBeVisible();
    await banner.getByRole("button", { name: "Nur notwendige" }).click();
    await expect(banner).toBeHidden();
    expect((await page.context().cookies()).find((cookie) => cookie.name === "bandival_consent")?.value).toBe("necessary");
    await page.reload();
    await expect(page.getByRole("dialog", { name: /Cookies/ })).toHaveCount(0);
    await page.getByRole("button", { name: "Cookie-Einstellungen" }).first().click();
    await expect(page.getByRole("dialog", { name: /Cookies/ })).toBeVisible();

    // Reset to the template again
    const reset = await admin.json<{ pages: Array<{ slug: string; custom: boolean; content: string }> }>(admin.put("/api/admin/legal", { slug: "impressum", content: null }));
    const imprint = reset.pages.find((entry) => entry.slug === "impressum")!;
    expect(imprint.custom).toBe(false);
    expect(imprint.content).toContain("§ 5 DDG");
  });
});
