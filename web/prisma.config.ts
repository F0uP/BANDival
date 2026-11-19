import { defineConfig } from "prisma/config";

/*
 * Prisma ORM 7 CLI configuration (migrate, db execute, generate).
 * Prisma no longer reads .env by itself – in Docker the variables come from the environment,
 * locally a .env next to package.json is loaded with Node's built-in loader.
 */
try {
  process.loadEnvFile(".env");
} catch {
  // no .env file – environment variables are provided by the container / shell
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // `generate` works without a database; migrate commands fail with a clear error when it is missing.
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
