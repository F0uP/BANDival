import { NextRequest, NextResponse } from "next/server";
import { CSRF_COOKIE_NAME, createCsrfToken, setCsrfCookie } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const existing = request.cookies.get(CSRF_COOKIE_NAME)?.value;
  const token = existing ?? createCsrfToken();
  const response = NextResponse.json({ csrfToken: token });
  if (!existing) {
    setCsrfCookie(response, token);
  }
  response.headers.set("Cache-Control", "no-store");
  return response;
}
