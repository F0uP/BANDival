import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertSongAccess, requireAuthUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ songId: string }> },
) {
  try {
    const session = await requireAuthUser(request);
    const { songId } = await context.params;
    await assertSongAccess(session.userId, songId);
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No audio file was uploaded." }, { status: 400 });
    }

    if (!file.type.startsWith("audio/")) {
      return NextResponse.json({ error: "Only audio files are allowed." }, { status: 400 });
    }

    const latest = await prisma.songAudioVersion.findFirst({
      where: { songId },
      orderBy: { versionNumber: "desc" },
    });

    const versionNumber = (latest?.versionNumber ?? 0) + 1;
    const fileExtension = path.extname(file.name) || ".mp3";
    const fileName = `${Date.now()}-${randomUUID()}${fileExtension}`;
    const relativeDir = path.join("uploads", "audio", songId);
    const absoluteDir = path.join(process.cwd(), "public", relativeDir);
    const absolutePath = path.join(absoluteDir, fileName);

    await mkdir(absoluteDir, { recursive: true });
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    await writeFile(absolutePath, fileBuffer);

    const audioVersion = await prisma.$transaction(async (tx) => {
      await tx.songAudioVersion.updateMany({
        where: { songId, isCurrent: true },
        data: { isCurrent: false },
      });

      return tx.songAudioVersion.create({
        data: {
          songId,
          versionNumber,
          fileUrl: `/${path.join(relativeDir, fileName).replaceAll("\\", "/")}`,
          fileName: file.name,
          mimeType: file.type || "audio/mpeg",
          durationSeconds: Number(formData.get("durationSeconds") ?? 0) || null,
          isCurrent: true,
        },
      });
    });

    return NextResponse.json({ audioVersion }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Audio upload failed." },
      { status: 400 },
    );
  }
}
