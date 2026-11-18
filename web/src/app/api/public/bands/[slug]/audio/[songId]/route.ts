import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveUploadPath, streamFile } from "@/lib/storage";

export const runtime = "nodejs";

/** Streams the current recording of a song the band marked as public (Range requests for seeking). */
export async function GET(request: NextRequest, context: { params: Promise<{ slug: string; songId: string }> }) {
  const { slug, songId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(songId)) return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
  const song = await prisma.song.findFirst({
    where: { id: songId, isPublic: true, band: { slug, publicEnabled: true } },
    select: { audioVersions: { where: { isCurrent: true }, take: 1, select: { fileUrl: true } } },
  });
  const file = song?.audioVersions[0] ? resolveUploadPath(song.audioVersions[0].fileUrl) : null;
  if (!file) return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
  try {
    return await streamFile(file, request, { "Cache-Control": "public, max-age=3600" });
  } catch {
    return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
  }
}
