import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { assertSetlistAccess, AuthError, requireAuthUser } from "@/lib/auth";

export const runtime = "nodejs";

function contentTypeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
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

    const fileName = path.posix.basename(relativePath);
    const match = fileName.match(/^setlist-([0-9a-fA-F-]{36})-\d+\.pdf$/);
    if (!match?.[1]) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }
    await assertSetlistAccess(session.userId, match[1]);

    const exportsRoot = path.resolve(process.cwd(), "public", "exports");
    const absolutePath = path.resolve(exportsRoot, ...relativePath.split("/").filter(Boolean));
    if (!absolutePath.startsWith(`${exportsRoot}${path.sep}`) && absolutePath !== exportsRoot) {
      return NextResponse.json({ error: "Invalid path." }, { status: 400 });
    }
    const buffer = await readFile(absolutePath);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentTypeFor(absolutePath),
        "Content-Disposition": `inline; filename="${path.basename(absolutePath)}"`,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }
}
