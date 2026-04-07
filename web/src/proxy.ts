import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE_NAME = "bandival_session";
const CSRF_COOKIE_NAME = "bandival_csrf";
const PUBLIC_AUTH_ROUTES = new Set([
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/me",
  "/api/auth/logout",
  "/api/auth/csrf",
]);

function isUnsafeMethod(method: string): boolean {
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/app")) {
    const hasSession = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);
    if (!hasSession) {
      return NextResponse.redirect(new URL("/", request.url));
    }

    return NextResponse.next();
  }

  if (!pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  if (isUnsafeMethod(request.method) && pathname !== "/api/auth/csrf") {
    const csrfCookie = request.cookies.get(CSRF_COOKIE_NAME)?.value;
    const csrfHeader = request.headers.get("x-csrf-token");
    if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
      return NextResponse.json({ error: "CSRF validation failed." }, { status: 403 });
    }
  }

  if (PUBLIC_AUTH_ROUTES.has(pathname)) {
    return NextResponse.next();
  }

  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!hasSession) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/api/:path*", "/api/events/:path*", "/api/setlists/:path*", "/api/bands/:path*", "/api/band-invites/:path*"],
};