import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertSetlistAccess, requireAuthUser } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse, HttpError } from "@/lib/http";
import { consumeRateLimit } from "@/lib/rate-limit";
import { clickTrackResponse } from "@/lib/click-track";

export const runtime = "nodejs";

/** One click track for the whole set – songs in order, a pause in between (?gap=seconds, ?countIn=bars). */
export async function GET(request: NextRequest, context: { params: Promise<{ setlistId: string }> }) {
  try {
    const session = await requireAuthUser(request);
    const setlistId = parseUuid((await context.params).setlistId, "Setlist-ID");
    await assertSetlistAccess(session.userId, setlistId, { allowGuest: true });
    await consumeRateLimit(`click:${session.userId}`, 60, 60 * 60 * 1000);
    const setlist = await prisma.setlist.findUnique({
      where: { id: setlistId },
      select: {
        name: true,
        items: {
          orderBy: { position: "asc" },
          select: { customTempoBpm: true, customDurationSeconds: true, song: { select: { title: true, tempoBpm: true, timeSignature: true, durationSeconds: true } } },
        },
      },
    });
    if (!setlist) throw new HttpError("Setlist nicht gefunden.", 404);
    if (setlist.items.length === 0) throw new HttpError("Diese Setlist ist leer.", 400);
    const params = request.nextUrl.searchParams;
    const gapSeconds = Math.min(60, Math.max(0, Number(params.get("gap") ?? 8) || 0));
    const countInBars = Math.min(2, Math.max(0, Number(params.get("countIn") ?? 1) || 0));
    return await clickTrackResponse(
      setlist.items.map((item) => ({
        title: item.song.title,
        bpm: item.customTempoBpm !== null && item.customTempoBpm !== undefined ? Number(item.customTempoBpm) : item.song.tempoBpm ? Number(item.song.tempoBpm) : null,
        timeSignature: item.song.timeSignature,
        durationSeconds: item.customDurationSeconds ?? item.song.durationSeconds,
      })),
      { countInBars, gapSeconds, fileName: `${setlist.name}-click` },
    );
  } catch (error) {
    return errorResponse(error, "Click-Track konnte nicht erstellt werden.");
  }
}
