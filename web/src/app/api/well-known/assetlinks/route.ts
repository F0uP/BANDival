import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * /.well-known/assetlinks.json – lets the Bandival Android app use the passkeys of this server.
 * Set ANDROID_CERT_SHA256 to the SHA-256 fingerprint of the app's signing certificate (AA:BB:…).
 */
export function GET() {
  const fingerprints = (process.env.ANDROID_CERT_SHA256 ?? "").split(",").map((value) => value.trim().toUpperCase()).filter((value) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(value));
  const statements = fingerprints.length
    ? [{
        relation: ["delegate_permission/common.handle_all_urls", "delegate_permission/common.get_login_creds"],
        target: { namespace: "android_app", package_name: process.env.ANDROID_PACKAGE_NAME ?? "app.bandival.android", sha256_cert_fingerprints: fingerprints },
      }]
    : [];
  return NextResponse.json(statements, { headers: { "Cache-Control": "public, max-age=3600" } });
}
