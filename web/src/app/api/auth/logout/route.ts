import { NextResponse } from "next/server";
import { clearCsrfCookie, clearSessionCookie, revokeSession } from "@/lib/auth";

export async function POST(request: Request) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const sessionCookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("bandival_session="));

  if (sessionCookie) {
    const token = decodeURIComponent(sessionCookie.replace("bandival_session=", ""));
    await revokeSession(token);
  }

  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  clearCsrfCookie(response);
  return response;
}
