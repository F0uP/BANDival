import { NextRequest, NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth";
import { aiStatus } from "@/lib/ai";
import { errorResponse } from "@/lib/http";

export async function GET(request: NextRequest) {
  try {
    await requireAuthUser(request);
    return NextResponse.json(aiStatus());
  } catch (error) {
    return errorResponse(error);
  }
}
