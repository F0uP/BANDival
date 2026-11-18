import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE_NAME = "bandival_session";
const CSRF_COOKIE_NAME = "bandival_csrf";

/** API routes that work without a session cookie. */
const PUBLIC_API_PREFIXES = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/me",
  "/api/auth/logout",
  "/api/auth/csrf",
  "/api/auth/config",
  "/api/auth/password",
  "/api/auth/passkey",
  "/api/well-known",
  "/api/auth/verify-email",
  "/api/health",
  "/api/public",
  "/api/push/vapid",
  "/api/band-invites/preview",
  "/api/calendar/feed/",
];

/** Unsafe-method routes exempt from the CSRF double-submit check (token-authenticated, no cookies). */
const CSRF_EXEMPT_PREFIXES = ["/api/auth/csrf"];

function isUnsafeMethod(method: string): boolean {
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`));
}

/** Constant-time comparison (no early exit that leaks how many characters matched). */
function sameToken(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}

function isHttps(request: NextRequest): boolean {
  return request.nextUrl.protocol === "https:" || request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https";
}

/**
 * Strict Content Security Policy: scripts only with the per-request nonce (Next.js adds it to its own scripts,
 * 'strict-dynamic' lets them load their chunks). No plugins, no foreign frames except the Spotify player.
 */
function contentSecurityPolicy(nonce: string, https: boolean): string {
  const development = process.env.NODE_ENV !== "production";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-src 'self' https://open.spotify.com",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    ...(https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

function withTransportSecurity(request: NextRequest, response: NextResponse): NextResponse {
  if (isHttps(request)) response.headers.set("Strict-Transport-Security", "max-age=63072000");
  return response;
}

/** Pages: nonce-based CSP (the nonce reaches the render via the request headers). */
function page(request: NextRequest): NextResponse {
  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce, isHttps(request));
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return withTransportSecurity(request, response);
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);

  if (!pathname.startsWith("/api")) {
    if (pathname.startsWith("/app") && !hasSession) {
      const loginUrl = new URL("/login", request.url);
      // Preserve the target (e.g. invite links) so the user lands there after login.
      loginUrl.searchParams.set("next", `${pathname}${search}`);
      return NextResponse.redirect(loginUrl);
    }
    return page(request);
  }

  if (isUnsafeMethod(request.method) && !matchesPrefix(pathname, CSRF_EXEMPT_PREFIXES)) {
    const csrfCookie = request.cookies.get(CSRF_COOKIE_NAME)?.value;
    const csrfHeader = request.headers.get("x-csrf-token");
    if (!csrfCookie || !csrfHeader || !sameToken(csrfCookie, csrfHeader)) {
      return NextResponse.json({ error: "Sicherheitsprüfung fehlgeschlagen (CSRF). Bitte Seite neu laden." }, { status: 403 });
    }
  }

  if (!matchesPrefix(pathname, PUBLIC_API_PREFIXES) && !hasSession) {
    return withTransportSecurity(request, NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 }));
  }

  return withTransportSecurity(request, NextResponse.next());
}

export const config = {
  // Everything except static assets and file downloads (those carry their own headers).
  matcher: ["/((?!_next/static|_next/image|icons/|uploads/|exports/|sw\.js|manifest\.webmanifest|offline\.html|icon\.svg|favicon|robots\.txt|bandival_logo\.svg).*)"],
};
