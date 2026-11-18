import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AuthError, getBandRole, requireAuthUser, writeAuditLog } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse } from "@/lib/http";

const patchSchema = z.object({
  role: z.enum(["owner", "admin", "member", "guest"]).optional(),
  instrumentPrimary: z.string().trim().max(100).nullable().optional(),
  /** Replaces the setlists a guest may see. */
  guestSetlistIds: z.array(z.string().uuid()).max(50).optional(),
});

type Context = { params: Promise<{ bandId: string; memberId: string }> };

const memberSelect = {
  id: true,
  userId: true,
  role: true,
  instrumentPrimary: true,
  joinedAt: true,
  user: { select: { id: true, email: true, displayName: true, avatarUrl: true } },
  guestSetlists: { select: { setlistId: true } },
} as const;

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const params = await context.params;
    const bandId = parseUuid(params.bandId, "Band-ID");
    const memberId = parseUuid(params.memberId, "Mitglieds-ID");
    const payload = patchSchema.parse(await request.json());

    const actorRole = await getBandRole(session.userId, bandId);
    const target = await prisma.bandMember.findFirst({ where: { id: memberId, bandId }, select: { id: true, userId: true, role: true } });
    if (!target) {
      throw new AuthError("Mitglied nicht gefunden.", 404);
    }

    const isSelf = target.userId === session.userId;
    const onlyInstrument = (payload.role === undefined || payload.role === target.role) && payload.guestSetlistIds === undefined;
    const manageable = (role: string) => role === "member" || role === "guest";

    // Everybody may edit their own instrument; everything else needs management rights.
    if (!(isSelf && onlyInstrument)) {
      if (actorRole === "member" || actorRole === "guest") {
        throw new AuthError("Dafür fehlen dir die Berechtigungen.", 403);
      }
      if (actorRole === "admin" && !manageable(target.role) && !isSelf) {
        throw new AuthError("Admins können nur Mitglieder und Gäste verwalten.", 403);
      }
      if (actorRole === "admin" && payload.role && !manageable(payload.role) && payload.role !== target.role) {
        throw new AuthError("Nur Owner können Rollen vergeben.", 403);
      }
    }

    if (payload.role && target.role === "owner" && payload.role !== "owner") {
      const ownerCount = await prisma.bandMember.count({ where: { bandId, role: "owner" } });
      if (ownerCount <= 1) {
        throw new AuthError("Die Band braucht mindestens einen Owner.", 409);
      }
    }

    if (payload.guestSetlistIds) {
      const ids = Array.from(new Set(payload.guestSetlistIds));
      const count = await prisma.setlist.count({ where: { bandId, id: { in: ids } } });
      if (count !== ids.length) {
        throw new AuthError("Mindestens eine Setlist gehört nicht zu dieser Band.", 400);
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (payload.guestSetlistIds) {
        await tx.guestSetlistAccess.deleteMany({ where: { memberId: target.id } });
        await tx.guestSetlistAccess.createMany({
          data: Array.from(new Set(payload.guestSetlistIds)).map((setlistId) => ({ memberId: target.id, setlistId })),
          skipDuplicates: true,
        });
      }
      return tx.bandMember.update({
        where: { id: target.id },
        data: {
          role: payload.role,
          instrumentPrimary: payload.instrumentPrimary === undefined ? undefined : payload.instrumentPrimary || null,
        },
        select: memberSelect,
      });
    });

    await writeAuditLog({
      bandId,
      actorUserId: session.userId,
      action: "member_updated",
      entityType: "member",
      entityId: updated.id,
      payload: {
        targetUserId: updated.userId,
        targetName: updated.user.displayName,
        role: updated.role,
        instrumentPrimary: updated.instrumentPrimary,
      },
    });

    return NextResponse.json({ member: updated });
  } catch (error) {
    return errorResponse(error, "Mitglied konnte nicht gespeichert werden.");
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const params = await context.params;
    const bandId = parseUuid(params.bandId, "Band-ID");
    const memberId = parseUuid(params.memberId, "Mitglieds-ID");
    const actorRole = await getBandRole(session.userId, bandId);

    if (actorRole === "member" || actorRole === "guest") {
      throw new AuthError("Dafür fehlen dir die Berechtigungen.", 403);
    }

    const target = await prisma.bandMember.findFirst({
      where: { id: memberId, bandId },
      select: { id: true, userId: true, role: true, user: { select: { displayName: true } } },
    });
    if (!target) {
      throw new AuthError("Mitglied nicht gefunden.", 404);
    }
    if (target.userId === session.userId) {
      throw new AuthError("Um selbst auszutreten, nutze „Band verlassen“ in den Einstellungen.", 409);
    }
    if (actorRole === "admin" && target.role !== "member" && target.role !== "guest") {
      throw new AuthError("Admins können nur Mitglieder entfernen.", 403);
    }
    if (target.role === "owner") {
      const ownerCount = await prisma.bandMember.count({ where: { bandId, role: "owner" } });
      if (ownerCount <= 1) {
        throw new AuthError("Der letzte Owner kann nicht entfernt werden.", 409);
      }
    }

    await prisma.bandMember.delete({ where: { id: target.id } });

    await writeAuditLog({
      bandId,
      actorUserId: session.userId,
      action: "member_removed",
      entityType: "member",
      entityId: target.id,
      payload: { targetUserId: target.userId, targetName: target.user.displayName, role: target.role },
    });

    return NextResponse.json({ ok: true, memberId: target.id });
  } catch (error) {
    return errorResponse(error, "Mitglied konnte nicht entfernt werden.");
  }
}
