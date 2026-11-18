import { readFile } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthError, requireAuthUser, requireBandMembership } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { aiTranscribe } from "@/lib/ai";
import { errorResponse } from "@/lib/http";
import { consumeRateLimit } from "@/lib/rate-limit";
import { resolveUploadPath } from "@/lib/storage";

export const runtime = "nodejs";

/** Speech-to-text for a voice memo; the text is appended to the idea notes. */
export async function POST(request: NextRequest, context: { params: Promise<{ ideaId: string }> }) {
  try {
    const session = await requireAuthUser(request);
    const ideaId = parseUuid((await context.params).ideaId, "Ideen-ID");
    const idea = await prisma.idea.findUnique({ where: { id: ideaId } });
    if (!idea) throw new AuthError("Idee nicht gefunden.", 404);
    await requireBandMembership(session.userId, idea.bandId);
    await consumeRateLimit(`ai:${session.userId}`, 30, 60 * 60 * 1000);
    const file = idea.fileUrl ? resolveUploadPath(idea.fileUrl) : null;
    if (!file) throw new AuthError("Diese Idee hat keine Aufnahme.", 400);
    const text = await aiTranscribe(await readFile(file), idea.fileName ?? "memo.webm", idea.mimeType ?? "audio/webm");
    const notes = [idea.notes, text ? `Transkript:\n${text}` : null].filter(Boolean).join("\n\n");
    await prisma.idea.update({ where: { id: idea.id }, data: { notes } });
    return NextResponse.json({ text, notes });
  } catch (error) {
    return errorResponse(error, "Transkription fehlgeschlagen.");
  }
}
