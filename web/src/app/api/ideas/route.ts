import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthUser, requireBandAction, requireBandMembership, writeAuditLog } from "@/lib/auth";
import { parseBandId } from "@/lib/api";
import { errorResponse } from "@/lib/http";
import { queueTranscode, storeAudioUpload } from "@/lib/audio";

export const runtime = "nodejs";

const ideaSelect = {
  id: true, title: true, notes: true, fileUrl: true, fileName: true, mimeType: true, durationSeconds: true, transcodeStatus: true, detectedBpm: true, detectedKey: true, songId: true, createdAt: true, updatedAt: true,
  createdBy: { select: { id: true, displayName: true, avatarUrl: true } },
  song: { select: { id: true, title: true } },
} as const;

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const bandId = parseBandId(request.nextUrl.searchParams.get("bandId"));
    await requireBandMembership(session.userId, bandId);
    const ideas = await prisma.idea.findMany({ where: { bandId }, orderBy: { createdAt: "desc" }, take: 300, select: ideaSelect });
    return NextResponse.json({ ideas });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Creates an idea – multipart with an optional voice memo/riff recording. */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const form = await request.formData();
    const bandId = parseBandId(String(form.get("bandId") ?? ""));
    await requireBandAction(session.userId, bandId, "ideas.create");
    const title = String(form.get("title") ?? "").trim().slice(0, 160) || `Idee vom ${new Date().toLocaleDateString("de-DE")}`;
    const notes = String(form.get("notes") ?? "").trim().slice(0, 5000) || null;
    const file = form.get("file");
    let fileUrl: string | null = null;
    let fileName: string | null = null;
    let mimeType: string | null = null;
    let transcodeStatus: "pending" | null = null;
    let probedDuration: number | null = null;
    let analysable = false;
    if (file instanceof File && file.size > 0) {
      const stored = await storeAudioUpload(file, "ideas", bandId);
      ({ fileUrl, mimeType, transcodeStatus } = stored);
      probedDuration = stored.durationSeconds;
      analysable = stored.analysable;
      fileName = file.name.slice(0, 255);
    }
    const durationSeconds = Math.round(Number(form.get("durationSeconds") ?? 0)) || probedDuration;
    const idea = await prisma.idea.create({
      data: { bandId, createdByUserId: session.userId, title, notes, fileUrl, fileName, mimeType, durationSeconds, transcodeStatus },
      select: ideaSelect,
    });
    if (transcodeStatus === "pending") queueTranscode({ kind: "idea", id: idea.id });
    else if (analysable) queueTranscode({ kind: "idea", id: idea.id, task: "analyze" });
    await writeAuditLog({ bandId, actorUserId: session.userId, action: "idea_created", entityType: "idea", entityId: idea.id, payload: { title } });
    return NextResponse.json({ idea }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Idee konnte nicht gespeichert werden.");
  }
}
