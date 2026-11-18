/** Runs once when the Next.js server starts – boots the background job scheduler. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") {
    return;
  }
  // Fail loudly at startup instead of on the first login when the secret is missing or weak.
  const { authSecret } = await import("@/lib/secret-box");
  try {
    authSecret();
  } catch (error) {
    console.error(`[security] ${error instanceof Error ? error.message : error}`);
  }
  const { startScheduler } = await import("@/lib/scheduler");
  startScheduler();
}
