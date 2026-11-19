/** Runs once when the Next.js server starts – boots the background job scheduler and audio conversion. */
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
  // Audio conversions interrupted by a restart continue in the background.
  const { resumePendingTranscodes } = await import("@/lib/audio");
  resumePendingTranscodes()
    .then((count) => { if (count) console.log(`[audio] resuming ${count} conversion(s)`); })
    .catch((error) => console.error("[audio] could not resume conversions:", error instanceof Error ? error.message : error));
}
