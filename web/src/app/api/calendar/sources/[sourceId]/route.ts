import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AuthError, requireAuthUser } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { syncCalendarSource } from "@/lib/calendar-sync";
import { presentSource, sourceSelect } from "@/lib/calendar-sources";
import { errorResponse } from "@/lib/http";

const patchSchema = z.object({
  label: z.string().trim().min(1).max(80).optional(),
  enabled: z.boolean().optional(),
});

type Context = { params: Promise<{ sourceId: string }> };

async function ownSource(request: NextRequest, context: Context) {
  const session = await requireAuthUser(request);
  const sourceId = parseUuid((await context.params).sourceId, "Kalender-ID");
  const source = await prisma.calendarSource.findFirst({ where: { id: sourceId, userId: session.userId } });
  if (!source) {
    throw new AuthError("Kalender nicht gefunden.", 404);
  }
  return source;
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const source = await ownSource(request, context);
    const payload = patchSchema.parse(await request.json());
    const updated = await prisma.calendarSource.update({ where: { id: source.id }, data: payload, select: sourceSelect });
    return NextResponse.json({ source: presentSource(updated) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    const source = await ownSource(request, context);
    await prisma.calendarSource.delete({ where: { id: source.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Kalender konnte nicht entfernt werden.");
  }
}

/** Manual "sync now". */
export async function POST(request: NextRequest, context: Context) {
  try {
    const source = await ownSource(request, context);
    if (source.kind !== "ics_url") {
      throw new AuthError("Importierte Dateien können nicht synchronisiert werden – bitte neu hochladen.", 400);
    }
    const result = await syncCalendarSource(source.id);
    const updated = await prisma.calendarSource.findUniqueOrThrow({ where: { id: source.id }, select: sourceSelect });
    if (!result.ok) {
      return NextResponse.json({ error: result.error, source: presentSource(updated) }, { status: 400 });
    }
    return NextResponse.json({ source: presentSource(updated), imported: result.count });
  } catch (error) {
    return errorResponse(error, "Synchronisierung fehlgeschlagen.");
  }
}
