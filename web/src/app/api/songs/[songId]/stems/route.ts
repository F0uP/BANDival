import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertSongAccess, requireAuthUser, writeAuditLog } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse, HttpError, toJsonSafe } from "@/lib/http";
import { queueTranscode, storeAudioUpload } from "@/lib/audio";

export const runtime = "nodejs";

type Context = { params: Promise<{ songId: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const songId = parseUuid((await context.params).songId, "Song-ID");
    await assertSongAccess(session.userId, songId, { allowGuest: true });
    const stems = await prisma.songStem.findMany({ where: { songId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
    return NextResponse.json(toJsonSafe({ stems }));
  } catch (error) {
    return errorResponse(error);
  }
}

/** Uploads one stem (single track of a multitrack recording). */
export async function POST(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const songId = parseUuid((await context.params).songId, "Song-ID");
    const { bandId } = await assertSongAccess(session.userId, songId);
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) throw new HttpError("Keine Audiodatei hochgeladen.", 400);
    const count = await prisma.songStem.count({ where: { songId } });
    if (count >= 16) throw new HttpError("Maximal 16 Spuren pro Song.", 400);

    const labelInput = String(formData.get("label") ?? "").trim();
    const label = (labelInput || file.name.replace(/\.[^.]+$/, "")).slice(0, 60);
    const stored = await storeAudioUpload(file, "audio", songId);
    const stem = await prisma.songStem.create({
      data: {
        songId, label, fileUrl: stored.fileUrl, fileName: file.name.slice(0, 255), mimeType: stored.mimeType, fileSizeBytes: BigInt(file.size), sortOrder: count,
        originalFileUrl: stored.fileUrl, transcodeStatus: stored.transcodeStatus,
      },
    });
    if (stem.transcodeStatus === "pending") queueTranscode({ kind: "stem", id: stem.id });
    await writeAuditLog({ bandId, actorUserId: session.userId, action: "stem_uploaded", entityType: "song", entityId: songId, payload: { songId, label } });
    return NextResponse.json(toJsonSafe({ stem }), { status: 201 });
  } catch (error) {
    return errorResponse(error, "Spur konnte nicht hochgeladen werden.");
  }
}
