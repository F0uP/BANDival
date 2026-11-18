import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuthUser, writeAuditLog } from "@/lib/auth";
import { dateKeyToUtcDate } from "@/lib/dates";
import { errorResponse } from "@/lib/http";

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datum.");

const putSchema = z.object({
  dates: z.array(dateKey).min(1).max(370),
  /** `null` clears the manual entry for these days. */
  status: z.enum(["available", "maybe", "unavailable"]).nullable(),
  note: z.string().trim().max(300).nullable().optional(),
  /** Optional: only used to write a single audit entry for the band currently viewed. */
  bandId: z.string().uuid().optional(),
});

/** Personal whole-day availability (e.g. holidays). Applies to all bands of the user. */
export async function PUT(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const payload = putSchema.parse(await request.json());
    const dates = Array.from(new Set(payload.dates)).map(dateKeyToUtcDate);

    if (payload.status === null) {
      await prisma.userDayAvailability.deleteMany({ where: { userId: session.userId, date: { in: dates } } });
    } else {
      const status = payload.status;
      await prisma.$transaction(
        dates.map((date) =>
          prisma.userDayAvailability.upsert({
            where: { userId_date: { userId: session.userId, date } },
            create: { userId: session.userId, date, status, note: payload.note ?? null },
            update: { status, note: payload.note === undefined ? undefined : payload.note },
          }),
        ),
      );
    }

    if (payload.bandId) {
      const isMember = await prisma.bandMember.count({ where: { bandId: payload.bandId, userId: session.userId } });
      if (isMember) {
        await writeAuditLog({
          bandId: payload.bandId,
          actorUserId: session.userId,
          action: "day_availability_updated",
          entityType: "availability",
          payload: { days: dates.length, status: payload.status, from: payload.dates[0] },
        });
      }
    }

    return NextResponse.json({ ok: true, updated: dates.length });
  } catch (error) {
    return errorResponse(error, "Verfügbarkeit konnte nicht gespeichert werden.");
  }
}
