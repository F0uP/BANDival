#!/usr/bin/env node
/**
 * Robust database migration on container start (Prisma ORM 7).
 *
 * Handles three situations that plain `prisma migrate deploy` cannot:
 *  1. Databases created earlier via `prisma db push` (tables exist, no migration history)
 *     -> the idempotent baseline is applied and recorded, then remaining migrations run.
 *  2. Installations where an old migration failed half-way -> the failed record is marked
 *     as rolled back so it can run again (all migrations are idempotent).
 *  3. Fresh databases -> normal `migrate deploy`.
 *
 * The checks use the `pg` driver directly; the Prisma CLI reads its connection from prisma.config.ts.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import pg from "pg";

const BASELINE = "0_init";
const require = createRequire(import.meta.url);
// Resolve the CLI entry directly (works without npx and without spawning .cmd files on Windows).
const prismaCli = path.join(path.dirname(require.resolve("prisma/package.json")), "build", "index.js");

function prisma(args) {
  execFileSync(process.execPath, [prismaCli, ...args], { stdio: "inherit" });
}

/** Same URL handling as src/lib/prisma.ts: Prisma-only parameters are not understood by `pg`. */
function connectionString() {
  const url = process.env.DATABASE_URL ?? "";
  try {
    const parsed = new URL(url);
    for (const key of ["connection_limit", "pool_timeout", "pgbouncer", "schema", "connect_timeout", "socket_timeout"]) parsed.searchParams.delete(key);
    return parsed.toString();
  } catch {
    return url;
  }
}

async function connect(attempts = 30) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const client = new pg.Client({ connectionString: connectionString(), connectionTimeoutMillis: 5000 });
    try {
      await client.connect();
      await client.query("SELECT 1");
      return client;
    } catch (error) {
      await client.end().catch(() => undefined);
      if (attempt === attempts) throw error;
      console.log(`[migrate] Waiting for database (${attempt}/${attempts}) ...`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  throw new Error("Database not reachable.");
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
  const client = await connect();
  try {
    const { rows: [state] } = await client.query(`
      SELECT
        to_regclass('public._prisma_migrations') IS NOT NULL AS has_history,
        to_regclass('public."AppUser"') IS NOT NULL AS has_tables
    `);

    if (!state.has_history && state.has_tables) {
      console.log("[migrate] Existing database without migration history detected – applying baseline.");
      prisma(["db", "execute", "--file", `prisma/migrations/${BASELINE}/migration.sql`]);
      prisma(["migrate", "resolve", "--applied", BASELINE]);
    }

    if (state.has_history) {
      const { rows: failed } = await client.query(`
        SELECT migration_name FROM _prisma_migrations
        WHERE finished_at IS NULL AND rolled_back_at IS NULL
      `);
      for (const { migration_name: name } of failed) {
        console.log(`[migrate] Marking previously failed migration as rolled back: ${name}`);
        prisma(["migrate", "resolve", "--rolled-back", name]);
      }
    }
  } finally {
    await client.end();
  }

  prisma(["migrate", "deploy"]);
  console.log("[migrate] Database is up to date.");
}

main().catch((error) => {
  console.error("[migrate] Migration failed:", error);
  process.exit(1);
});
