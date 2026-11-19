import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    // Locally an installed browser can be used instead of the downloaded one, e.g. E2E_BROWSER_CHANNEL=msedge.
    channel: process.env.E2E_BROWSER_CHANNEL || undefined,
  },
});
