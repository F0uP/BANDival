import { NextRequest, NextResponse } from "next/server";
import { MembershipRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AuthError, requireAuthUser, writeAuditLog } from "@/lib/auth";

const patchSchema = z.object({
  role: z.enum(["owner", "admin", "member"]).optional(),
  instrumentPrimary: z.string().max(100).nullable().optional(),
});

async function getActorRole(userId: string, bandId: string): Promise<MembershipRole> {
  const actorMember = await prisma.bandMember.findUnique({
    where: {
      bandId_userId: {
        bandId,
        userId,
      },
    },
    select: { role: true },
  });

  if (!actorMember) {
    throw new AuthError("No membership in this band.", 403);
  }

  return actorMember.role;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ bandId: string; memberId: string }> },
) {
  try {
    const session = await requireAuthUser(request);
    const { bandId, memberId } = await context.params;
    const payload = patchSchema.parse(await request.json());

    const actorRole = await getActorRole(session.userId, bandId);
    if (actorRole === "member") {
      throw new AuthError("Insufficient permissions.", 403);
    }

    const target = await prisma.bandMember.findFirst({
      where: { id: memberId, bandId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });

    if (!target) {
      throw new AuthError("Member not found.", 404);
    }

    if (actorRole === "admin" && target.role !== "member") {
      throw new AuthError("Admins can only manage members.", 403);
    }

    if (payload.role) {
      if (actorRole === "admin" && payload.role !== "member") {
        throw new AuthError("Admins cannot promote roles.", 403);
      }

      if (target.userId === session.userId && target.role === "owner" && payload.role !== "owner") {
        const ownerCount = await prisma.bandMember.count({
          where: { bandId, role: "owner" },
        });
        if (ownerCount <= 1) {
          throw new AuthError("At least one owner is required.", 409);
        }
      }

      if (target.role === "owner" && payload.role !== "owner") {
        const ownerCount = await prisma.bandMember.count({
          where: { bandId, role: "owner" },
        });
        if (ownerCount <= 1) {
          throw new AuthError("Cannot demote the last owner.", 409);
        }
      }
    }

    const updated = await prisma.bandMember.update({
      where: { id: target.id },
      data: {
        role: payload.role,
        instrumentPrimary: payload.instrumentPrimary,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });

    await writeAuditLog({
      bandId,
      actorUserId: session.userId,
      action: "member_updated",
      entityType: "band_member",
      entityId: updated.id,
      payload: {
        targetUserId: updated.userId,
        role: updated.role,
        instrumentPrimary: updated.instrumentPrimary,
      },
    });

    return NextResponse.json({ member: updated });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update member." },
      { status: 400 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ bandId: string; memberId: string }> },
) {
  try {
    const session = await requireAuthUser(request);
    const { bandId, memberId } = await context.params;
    const actorRole = await getActorRole(session.userId, bandId);

    if (actorRole === "member") {
      throw new AuthError("Insufficient permissions.", 403);
    }

    const target = await prisma.bandMember.findFirst({
      where: { id: memberId, bandId },
      select: { id: true, userId: true, role: true },
    });

    if (!target) {
      throw new AuthError("Member not found.", 404);
    }

    if (target.userId === session.userId) {
      throw new AuthError("Use leave-band for your own membership.", 409);
    }

    if (actorRole === "admin" && target.role !== "member") {
      throw new AuthError("Admins can only remove members.", 403);
    }

    if (target.role === "owner") {
      const ownerCount = await prisma.bandMember.count({
        where: { bandId, role: "owner" },
      });
      if (ownerCount <= 1) {
        throw new AuthError("Cannot remove the last owner.", 409);
      }
    }

    await prisma.bandMember.delete({ where: { id: target.id } });

    await writeAuditLog({
      bandId,
      actorUserId: session.userId,
      action: "member_removed",
      entityType: "band_member",
      entityId: target.id,
      payload: {
        targetUserId: target.userId,
        role: target.role,
      },
    });

    return NextResponse.json({ ok: true, memberId: target.id });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to remove member." },
      { status: 400 },
    );
  }
}
