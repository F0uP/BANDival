import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Used by Docker health checks and by the Android app to verify a server URL. */
export async function GET() {
  let database = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = "unreachable";
  }

  return NextResponse.json(
    {
      app: "bandival",
      ok: database === "ok",
      database,
      version: process.env.BANDIVAL_VERSION ?? "dev",
    },
    {
      status: database === "ok" ? 200 : 503,
      headers: { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" },
    },
  );
}
