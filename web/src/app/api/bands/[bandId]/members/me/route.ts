import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AuthError, requireAuthUser, requireBandMembership } from "@/lib/auth";

const patchSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  avatarUrl: z.string().url().nullable().optional(),
  instrumentPrimary: z.string().max(100).nullable().optional(),
});

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ bandId: string }> },
) {
  try {
    const session = await requireAuthUser(request);
    const { bandId } = await context.params;
    await requireBandMembership(session.userId, bandId);

    const me = await prisma.bandMember.findUnique({
      where: {
        bandId_userId: {
          bandId,
          userId: session.userId,
        },
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

    if (!me) {
      throw new AuthError("No membership in this band.", 403);
    }

    return NextResponse.json({ me });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load profile." },
      { status: 400 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ bandId: string }> },
) {
  try {
    const session = await requireAuthUser(request);
    const { bandId } = await context.params;
    await requireBandMembership(session.userId, bandId);

    const payload = patchSchema.parse(await request.json());

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.appUser.update({
        where: { id: session.userId },
        data: {
          displayName: payload.displayName,
          avatarUrl: payload.avatarUrl,
        },
        select: {
          id: true,
          email: true,
          displayName: true,
          avatarUrl: true,
        },
      });

      const membership = await tx.bandMember.update({
        where: {
          bandId_userId: {
            bandId,
            userId: session.userId,
          },
        },
        data: {
          instrumentPrimary: payload.instrumentPrimary,
        },
        select: {
          role: true,
          instrumentPrimary: true,
        },
      });

      return {
        user,
        role: membership.role,
        instrumentPrimary: membership.instrumentPrimary,
      };
    });

    return NextResponse.json({ me: result });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update profile." },
      { status: 400 },
    );
  }
}
