import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertAlbumAccess, requireAuthUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ albumId: string }> },
) {
  try {
    const session = await requireAuthUser(request);
    const { albumId } = await context.params;
    await assertAlbumAccess(session.userId, albumId);
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Only image files are allowed." }, { status: 400 });
    }

    const extension = path.extname(file.name) || ".png";
    const generatedName = `${Date.now()}-${randomUUID()}${extension}`;
    const relativeDir = path.join("uploads", "albums", albumId);
    const absoluteDir = path.join(process.cwd(), "public", relativeDir);

    await mkdir(absoluteDir, { recursive: true });
    await writeFile(path.join(absoluteDir, generatedName), Buffer.from(await file.arrayBuffer()));

    const coverUrl = `/${path.join(relativeDir, generatedName).replaceAll("\\", "/")}`;

    const album = await prisma.album.update({
      where: { id: albumId },
      data: { coverUrl },
    });

    return NextResponse.json({ album });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Album cover upload failed." },
      { status: 400 },
    );
  }
}
