import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

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
  _request: NextRequest,
  context: { params: Promise<{ filePath: string[] }> },
) {
  try {
    const { filePath } = await context.params;
    const relativePath = path.normalize(filePath.join("/"));
    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      return NextResponse.json({ error: "Invalid path." }, { status: 400 });
    }

    const absolutePath = path.join(process.cwd(), "public", "exports", relativePath);
    const buffer = await readFile(absolutePath);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentTypeFor(absolutePath),
        "Content-Disposition": `inline; filename="${path.basename(absolutePath)}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }
}
