import { access } from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { requireAuthUser, requireBandAction } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { getBackupDir } from "@/lib/backup";
import { HttpError, errorResponse } from "@/lib/http";
import { streamFile } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ bandId: string; name: string }> }) {
  try {
    const session = await requireAuthUser(request);
    const params = await context.params;
    const bandId = parseUuid(params.bandId, "Band-ID");
    await requireBandAction(session.userId, bandId, "backup.export");
    if (!/^\d{4}-\d{2}-\d{2}\.json$/.test(params.name)) {
      throw new HttpError("Unbekanntes Backup.", 404);
    }
    const file = path.join(getBackupDir(), bandId, params.name);
    await access(file).catch(() => {
      throw new HttpError("Backup nicht gefunden.", 404);
    });
    return await streamFile(file, request, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="bandival-backup-${params.name}"`,
    });
  } catch (error) {
    return errorResponse(error, "Backup nicht gefunden.");
  }
}
