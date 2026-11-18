import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, clearCsrfCookie, clearSessionCookie, revokeSession } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    try {
      await revokeSession(token);
    } catch (error) {
      console.error("[logout]", error);
    }
  }

  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  clearCsrfCookie(response);
  return response;
}
