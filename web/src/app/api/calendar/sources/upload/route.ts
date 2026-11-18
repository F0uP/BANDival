import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthError, requireAuthUser } from "@/lib/auth";
import { importIcsIntoSource } from "@/lib/calendar-sync";
import { presentSource, sourceSelect } from "@/lib/calendar-sources";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024;

/** One-time import of an .ics file (e.g. exported from Outlook or Apple Calendar). */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const formData = await request.formData();
    const file = formData.get("file");
    const label = String(formData.get("label") ?? "").trim().slice(0, 80);

    if (!(file instanceof File)) {
      throw new AuthError("Keine Datei hochgeladen.", 400);
    }
    if (file.size > MAX_BYTES) {
      throw new AuthError("Datei zu groß (max. 10 MB).", 400);
    }
    const text = await file.text();
    if (!text.includes("BEGIN:VCALENDAR")) {
      throw new AuthError("Das ist keine gültige .ics-Kalenderdatei.", 400);
    }

    const source = await prisma.calendarSource.create({
      data: { userId: session.userId, label: label || file.name.replace(/\.ics$/i, "") || "Kalender-Import", kind: "ics_file" },
    });

    try {
      const imported = await importIcsIntoSource(source.id, session.userId, text);
      const saved = await prisma.calendarSource.findUniqueOrThrow({ where: { id: source.id }, select: sourceSelect });
      return NextResponse.json({ source: presentSource(saved), imported }, { status: 201 });
    } catch (error) {
      await prisma.calendarSource.delete({ where: { id: source.id } });
      throw error;
    }
  } catch (error) {
    return errorResponse(error, "Kalender konnte nicht importiert werden.");
  }
}
