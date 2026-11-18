import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Server clock for NTP-style offset measurement of the live sync (followers align their beat grid to it). */
export async function GET() {
  return NextResponse.json({ serverTime: Date.now() }, { headers: { "Cache-Control": "no-store" } });
}
