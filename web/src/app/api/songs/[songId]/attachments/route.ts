import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { AttachmentKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertSongAccess, requireAuthUser } from "@/lib/auth";

export const runtime = "nodejs";

function parseAttachmentKind(value: string | null): AttachmentKind {
  switch (value) {
    case "lead_sheet":
    case "score_pdf":
    case "score_musicxml":
    case "score_image":
    case "lyrics_doc":
      return value;
    default:
      return "other";
  }
}

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
      return NextResponse.json({ error: "No file was uploaded." }, { status: 400 });
    }

    const kind = parseAttachmentKind(formData.get("kind")?.toString() ?? null);
    const fileExtension = path.extname(file.name);
    const fileName = `${Date.now()}-${randomUUID()}${fileExtension}`;
    const relativeDir = path.join("uploads", "songs", songId);
    const absoluteDir = path.join(process.cwd(), "public", relativeDir);
    const absolutePath = path.join(absoluteDir, fileName);

    await mkdir(absoluteDir, { recursive: true });
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    await writeFile(absolutePath, fileBuffer);

    const attachment = await prisma.songAttachment.create({
      data: {
        songId,
        kind,
        fileUrl: `/${path.join(relativeDir, fileName).replaceAll("\\", "/")}`,
        fileName: file.name,
        mimeType: file.type || null,
        fileSizeBytes: BigInt(file.size),
      },
    });

    return NextResponse.json({ attachment }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed." },
      { status: 400 },
    );
  }
}
