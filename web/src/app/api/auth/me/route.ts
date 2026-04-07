import { NextRequest, NextResponse } from "next/server";
import { AuthError, createCsrfToken, requireAuthUser, setCsrfCookie } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const response = NextResponse.json({ user: session });
    setCsrfCookie(response, createCsrfToken());
    return response;
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: "Failed to fetch session." }, { status: 400 });
  }
}
