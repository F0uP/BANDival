import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AuthError, getBandRole, requireAuthUser, writeAuditLog } from "@/lib/auth";
import { errorResponse } from "@/lib/http";

const schema = z.object({
  bandId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const payload = schema.parse(await request.json());
    const role = await getBandRole(session.userId, payload.bandId);

    if (role === "owner") {
      const [ownerCount, memberCount] = await Promise.all([
        prisma.bandMember.count({ where: { bandId: payload.bandId, role: "owner" } }),
        prisma.bandMember.count({ where: { bandId: payload.bandId } }),
      ]);
      if (ownerCount <= 1 && memberCount > 1) {
        throw new AuthError("Du bist der letzte Owner. Ernenne zuerst ein anderes Mitglied zum Owner.", 409);
      }
      if (memberCount <= 1) {
        throw new AuthError("Du bist das einzige Mitglied. Lösche die Band stattdessen in den Einstellungen.", 409);
      }
    }

    await prisma.bandMember.delete({
      where: { bandId_userId: { bandId: payload.bandId, userId: session.userId } },
    });

    await writeAuditLog({
      bandId: payload.bandId,
      actorUserId: session.userId,
      action: "member_left",
      entityType: "band_member",
      entityId: session.userId,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Band konnte nicht verlassen werden.");
  }
}
