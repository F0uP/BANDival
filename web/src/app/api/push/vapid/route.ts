import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/http";
import { getVapidKeys } from "@/lib/push";

export async function GET() {
  try {
    const { publicKey } = await getVapidKeys();
    return NextResponse.json({ publicKey });
  } catch (error) {
    return errorResponse(error, "Push ist auf diesem Server nicht verfügbar.");
  }
}
