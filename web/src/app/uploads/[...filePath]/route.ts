import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthError, assertAlbumAccess, assertSongAccess, requireAuthUser, requireBandMembership } from "@/lib/auth";
import { HttpError } from "@/lib/http";
import { getUploadRoot, streamFile } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ filePath: string[] }> }) {
  try {
    const session = await requireAuthUser(request);
    const { filePath } = await context.params;
    const relativePath = path.posix.normalize(filePath.join("/").replaceAll("\\", "/"));
    if (relativePath === ".." || relativePath.startsWith("../") || path.posix.isAbsolute(relativePath)) {
      throw new HttpError("Ungültiger Pfad.", 400);
    }

    const segments = relativePath.split("/").filter(Boolean);
    const [scope, entityId] = segments;
    if (segments.length < 3 || !scope || !entityId || !/^[0-9a-f-]{36}$/i.test(entityId)) {
      throw new HttpError("Ungültiger Pfad.", 400);
    }

    if (scope === "audio" || scope === "songs") {
      await assertSongAccess(session.userId, entityId, { allowGuest: true });
    } else if (scope === "albums") {
      await assertAlbumAccess(session.userId, entityId);
    } else if (scope === "ideas" || scope === "bands") {
      await requireBandMembership(session.userId, entityId);
    } else if (scope === "avatars") {
      if (entityId !== session.userId) {
        const sharedBand = await prisma.bandMember.findFirst({
          where: { userId: session.userId, band: { members: { some: { userId: entityId } } } },
          select: { id: true },
        });
        if (!sharedBand) {
          throw new AuthError("Kein Zugriff.", 403);
        }
      }
    } else {
      throw new HttpError("Ungültiger Pfad.", 400);
    }

    const root = getUploadRoot();
    const absolutePath = path.resolve(root, ...segments);
    if (!absolutePath.startsWith(`${root}${path.sep}`)) {
      throw new HttpError("Ungültiger Pfad.", 400);
    }

    const wantsDownload = request.nextUrl.searchParams.get("download") === "1";
    return await streamFile(absolutePath, request, wantsDownload
      ? { "Content-Disposition": `attachment; filename="${path.basename(absolutePath)}"` }
      : {});
  } catch (error) {
    if (error instanceof AuthError || error instanceof HttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Datei nicht gefunden." }, { status: 404 });
  }
}
