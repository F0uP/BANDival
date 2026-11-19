import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

declare global {
  var prisma: PrismaClient | undefined;
}

/**
 * Connection settings for the `pg` driver adapter (Prisma ORM 7).
 * Prisma-specific URL parameters of older setups are translated: `connection_limit` → pool size,
 * `schema` → adapter schema; `pgbouncer`/`pool_timeout` are dropped (not understood by `pg`).
 */
export function connectionConfig(url = process.env.DATABASE_URL ?? "") {
  let connectionString = url;
  let max = Number(process.env.DATABASE_POOL_SIZE ?? 10);
  let schema: string | undefined;
  try {
    const parsed = new URL(url);
    const limit = parsed.searchParams.get("connection_limit");
    if (limit && !process.env.DATABASE_POOL_SIZE) max = Number(limit);
    schema = parsed.searchParams.get("schema") ?? undefined;
    for (const key of ["connection_limit", "pool_timeout", "pgbouncer", "schema", "connect_timeout", "socket_timeout"]) parsed.searchParams.delete(key);
    connectionString = parsed.toString();
  } catch {
    // not a URL – handed to pg unchanged
  }
  return {
    pool: { connectionString, max: Number.isFinite(max) && max > 0 ? max : 10, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 30_000 },
    schema: schema && schema !== "public" ? schema : undefined,
  };
}

function createClient(): PrismaClient {
  const { pool, schema } = connectionConfig();
  const adapter = new PrismaPg(pool, schema ? { schema } : undefined);
  return new PrismaClient({ adapter });
}

/**
 * One client (and connection pool) per server process. In production the RSC pages and the route handlers
 * are separate module graphs – caching on globalThis keeps them from opening a second pool.
 */
export const prisma = global.prisma ?? createClient();
global.prisma = prisma;
