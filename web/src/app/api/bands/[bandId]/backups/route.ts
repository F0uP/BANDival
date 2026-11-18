import { NextRequest, NextResponse } from "next/server";
import { requireAuthUser, requireBandAction } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { listBackups } from "@/lib/backup";
import { errorResponse } from "@/lib/http";

/** Lists the automatic nightly backups stored on the server. */
export async function GET(request: NextRequest, context: { params: Promise<{ bandId: string }> }) {
  try {
    const session = await requireAuthUser(request);
    const bandId = parseUuid((await context.params).bandId, "Band-ID");
    await requireBandAction(session.userId, bandId, "backup.export");
    const backups = await listBackups(bandId);
    const retentionDays = Math.max(1, Number(process.env.BACKUP_RETENTION_DAYS ?? 14) || 14);
    return NextResponse.json({ backups, enabled: process.env.BACKUP_ENABLED !== "false", retentionDays });
  } catch (error) {
    return errorResponse(error);
  }
}
