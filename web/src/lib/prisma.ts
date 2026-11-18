import { PrismaClient } from "@prisma/client";

declare global {
  var prisma: PrismaClient | undefined;
}

/**
 * One client (and connection pool) per server process. In production the RSC pages and the route handlers
 * are separate module graphs – caching on globalThis keeps them from opening a second pool.
 */
export const prisma = global.prisma ?? new PrismaClient();
global.prisma = prisma;
