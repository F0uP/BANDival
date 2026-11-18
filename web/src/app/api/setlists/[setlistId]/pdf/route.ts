import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthError, assertSetlistAccess, requireAuthUser } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse } from "@/lib/http";
import { loadSetlist } from "@/lib/setlists";
import { renderSetlistPdf } from "@/lib/setlist-pdf";

export const runtime = "nodejs";

type Context = { params: Promise<{ setlistId: string }> };

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "setlist";
}

/** Streams the setlist as a stage-ready PDF. */
export async function GET(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const setlistId = parseUuid((await context.params).setlistId, "Setlist-ID");
    const { bandId } = await assertSetlistAccess(session.userId, setlistId, { allowGuest: true });

    const [setlist, band] = await Promise.all([
      loadSetlist(setlistId),
      prisma.band.findUnique({ where: { id: bandId }, select: { name: true, timezone: true } }),
    ]);
    if (!setlist || !band) {
      throw new AuthError("Setlist nicht gefunden.", 404);
    }

    const nextEvent = setlist.events.find((event) => event.startsAt >= new Date()) ?? setlist.events[0];
    const eventLabel = nextEvent
      ? `${nextEvent.title} · ${nextEvent.startsAt.toLocaleDateString("de-DE", { timeZone: band.timezone, dateStyle: "medium" })}`
      : null;

    const bytes = await renderSetlistPdf({
      bandName: band.name,
      name: setlist.name,
      description: setlist.description,
      eventLabel,
      items: setlist.items.map((item, index) => ({
        position: index + 1,
        title: item.song.title,
        keySignature: item.customKeySignature ?? item.song.keySignature,
        tempoBpm: item.song.tempoBpm ? Number(item.song.tempoBpm) : null,
        durationSeconds: item.customDurationSeconds ?? item.song.durationSeconds,
        transitionNotes: item.transitionNotes,
      })),
    });

    const download = request.nextUrl.searchParams.get("download") === "1";
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${slugify(setlist.name)}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return errorResponse(error, "PDF konnte nicht erstellt werden.");
  }
}

/** Backwards compatible: returns the URL of the on-the-fly PDF. */
export async function POST(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const setlistId = parseUuid((await context.params).setlistId, "Setlist-ID");
    await assertSetlistAccess(session.userId, setlistId, { allowGuest: true });
    const pdfExportUrl = `/api/setlists/${setlistId}/pdf`;
    return NextResponse.json({ setlist: { id: setlistId, pdfExportUrl } });
  } catch (error) {
    return errorResponse(error);
  }
}
