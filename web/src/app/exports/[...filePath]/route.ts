import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

/**
 * Legacy route: PDFs used to be written to disk. They are now generated on the fly,
 * so old links are redirected to the live PDF of the same setlist.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ filePath: string[] }> }) {
  const { filePath } = await context.params;
  const fileName = path.posix.basename(filePath.join("/"));
  const match = fileName.match(/^setlist-([0-9a-fA-F-]{36})-\d+\.pdf$/);
  if (!match?.[1]) {
    return NextResponse.json({ error: "Datei nicht gefunden." }, { status: 404 });
  }
  return NextResponse.redirect(new URL(`/api/setlists/${match[1]}/pdf`, request.url));
}
