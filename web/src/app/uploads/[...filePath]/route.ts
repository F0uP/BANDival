import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { assertAlbumAccess, assertSongAccess, AuthError, requireAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function contentTypeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".mp3":
      return "audio/mpeg";
    case ".wav":
      return "audio/wav";
    case ".ogg":
      return "audio/ogg";
    case ".m4a":
      return "audio/mp4";
    case ".flac":
      return "audio/flac";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".svg":
      return "image/svg+xml";
    case ".pdf":
      return "application/pdf";
    default:
      return "application/octet-stream";
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ filePath: string[] }> },
) {
  try {
    const session = await requireAuthUser(request);
    const { filePath } = await context.params;
    const relativePath = path.posix.normalize(filePath.join("/").replaceAll("\\", "/"));
    if (relativePath === ".." || relativePath.startsWith("../") || path.posix.isAbsolute(relativePath)) {
      return NextResponse.json({ error: "Invalid path." }, { status: 400 });
    }

    const segments = relativePath.split("/").filter(Boolean);
    if (segments.length < 3) {
      return NextResponse.json({ error: "Invalid path." }, { status: 400 });
    }

    const [scope, entityId] = segments;
    if (!entityId) {
      return NextResponse.json({ error: "Invalid path." }, { status: 400 });
    }

    if (scope === "audio" || scope === "songs") {
      await assertSongAccess(session.userId, entityId);
    } else if (scope === "albums") {
      await assertAlbumAccess(session.userId, entityId);
    } else if (scope === "avatars" && entityId !== session.userId) {
      const sharedBand = await prisma.bandMember.findFirst({
        where: {
          userId: session.userId,
          band: {
            members: {
              some: {
                userId: entityId,
              },
            },
          },
        },
        select: { id: true },
      });

      if (!sharedBand) {
        return NextResponse.json({ error: "Access denied." }, { status: 403 });
      }
    }

    const uploadsRoot = path.resolve(process.cwd(), "public", "uploads");
    const absolutePath = path.resolve(uploadsRoot, ...segments);
    if (!absolutePath.startsWith(`${uploadsRoot}${path.sep}`) && absolutePath !== uploadsRoot) {
      return NextResponse.json({ error: "Invalid path." }, { status: 400 });
    }
    const buffer = await readFile(absolutePath);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentTypeFor(absolutePath),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }
}
