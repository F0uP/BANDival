import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthError, requireAuthUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Only image files are allowed." }, { status: 400 });
    }

    const extension = path.extname(file.name) || ".png";
    const fileName = `${Date.now()}-${randomUUID()}${extension}`;
    const relativeDir = path.join("uploads", "avatars", session.userId);
    const absoluteDir = path.join(process.cwd(), "public", relativeDir);
    const absolutePath = path.join(absoluteDir, fileName);

    await mkdir(absoluteDir, { recursive: true });
    await writeFile(absolutePath, Buffer.from(await file.arrayBuffer()));

    const avatarUrl = `/${path.join(relativeDir, fileName).replaceAll("\\", "/")}`;
    const user = await prisma.appUser.update({
      where: { id: session.userId },
      data: { avatarUrl },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
      },
    });

    return NextResponse.json({ user, avatarUrl });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Avatar upload failed." },
      { status: 400 },
    );
  }
}
