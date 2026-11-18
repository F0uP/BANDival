import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveUploadPath, streamFile } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const band = await prisma.band.findFirst({ where: { slug: (await context.params).slug, publicEnabled: true }, select: { pressPhotoUrl: true } });
  const file = band?.pressPhotoUrl ? resolveUploadPath(band.pressPhotoUrl) : null;
  if (!file) return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
  try {
    return await streamFile(file, request, { "Cache-Control": "public, max-age=3600" });
  } catch {
    return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
  }
}
