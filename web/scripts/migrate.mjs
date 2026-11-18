#!/usr/bin/env node
/**
 * Robust database migration on container start.
 *
 * Handles three situations that plain `prisma migrate deploy` cannot:
 *  1. Databases created earlier via `prisma db push` (tables exist, no migration history)
 *     -> the idempotent baseline is applied and recorded, then remaining migrations run.
 *  2. Installations where the old `20260407_add_discussion_authors` migration failed on an
 *     empty database -> the failed record is marked as rolled back so it can run again.
 *  3. Fresh databases -> normal `migrate deploy`.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const BASELINE = "0_init";
const require = createRequire(import.meta.url);
// Resolve the CLI entry directly (works without npx and without spawning .cmd files on Windows).
const prismaCli = path.join(path.dirname(require.resolve("prisma/package.json")), "build", "index.js");

function prisma(args) {
  execFileSync(process.execPath, [prismaCli, ...args], { stdio: "inherit" });
}

async function waitForDatabase(client, attempts = 30) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await client.$queryRaw`SELECT 1`;
      return;
    } catch (error) {
      if (attempt === attempts) {
        throw error;
      }
      console.log(`[migrate] Waiting for database (${attempt}/${attempts}) ...`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

async function main() {
  const client = new PrismaClient();
  try {
    await waitForDatabase(client);

    const [{ has_history: hasHistory, has_tables: hasTables }] = await client.$queryRaw`
      SELECT
        to_regclass('public._prisma_migrations') IS NOT NULL AS has_history,
        to_regclass('public."AppUser"') IS NOT NULL AS has_tables
    `;

    if (!hasHistory && hasTables) {
      console.log("[migrate] Existing database without migration history detected – applying baseline.");
      prisma(["db", "execute", "--file", `prisma/migrations/${BASELINE}/migration.sql`, "--schema", "prisma/schema.prisma"]);
      prisma(["migrate", "resolve", "--applied", BASELINE]);
    }

    if (hasHistory) {
      const failed = await client.$queryRaw`
        SELECT migration_name FROM _prisma_migrations
        WHERE finished_at IS NULL AND rolled_back_at IS NULL
      `;
      for (const { migration_name: name } of failed) {
        console.log(`[migrate] Marking previously failed migration as rolled back: ${name}`);
        prisma(["migrate", "resolve", "--rolled-back", name]);
      }
    }
  } finally {
    await client.$disconnect();
  }

  prisma(["migrate", "deploy"]);
  console.log("[migrate] Database is up to date.");
}

main().catch((error) => {
  console.error("[migrate] Migration failed:", error);
  process.exit(1);
});
