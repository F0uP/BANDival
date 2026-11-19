import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuthUser, requireBandAction, writeAuditLog } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse } from "@/lib/http";
import { createRiderShare, riderShareUrl } from "@/lib/rider-share";

type Context = { params: Promise<{ bandId: string }> };

function present(share: { id: string; token: string; eventId: string | null; createdAt: Date; expiresAt: Date | null; lastViewedAt: Date | null }) {
  return { id: share.id, url: riderShareUrl(share.token), eventId: share.eventId, createdAt: share.createdAt, expiresAt: share.expiresAt, lastViewedAt: share.lastViewedAt };
}

/** Public tech-rider links of the band (optionally only those of one gig: ?eventId=). */
export async function GET(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const bandId = parseUuid((await context.params).bandId, "Band-ID");
    await requireBandAction(session.userId, bandId, "events.manage");
    const eventId = request.nextUrl.searchParams.get("eventId");
    const general = request.nextUrl.searchParams.get("general") === "1";
    const shares = await prisma.riderShare.findMany({
      where: { bandId, ...(eventId ? { eventId: parseUuid(eventId, "Termin-ID") } : general ? { eventId: null } : {}), OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ shares: shares.map(present) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const bandId = parseUuid((await context.params).bandId, "Band-ID");
    await requireBandAction(session.userId, bandId, "events.manage");
    const payload = z.object({ eventId: z.string().uuid().nullable().optional() }).parse(await request.json().catch(() => ({})));
    const share = await createRiderShare({ bandId, eventId: payload.eventId ?? null, userId: session.userId });
    await writeAuditLog({ bandId, actorUserId: session.userId, action: "band_updated", entityType: "band", entityId: bandId, payload: { riderShared: true, eventId: share.eventId } });
    return NextResponse.json({ share: present(share) }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Link konnte nicht erstellt werden.");
  }
}
