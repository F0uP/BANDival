import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AuthError, requireAuthUser, requireBandMembership } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse } from "@/lib/http";

const patchSchema = z.object({
  displayName: z.string().trim().min(1, "Der Name darf nicht leer sein.").max(100).optional(),
  avatarUrl: z.union([z.string().url(), z.string().startsWith("/uploads/")]).nullable().optional(),
  instrumentPrimary: z.string().trim().max(100).nullable().optional(),
});

type Context = { params: Promise<{ bandId: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const bandId = parseUuid((await context.params).bandId, "Band-ID");
    await requireBandMembership(session.userId, bandId, { allowGuest: true });

    const me = await prisma.bandMember.findUnique({
      where: { bandId_userId: { bandId, userId: session.userId } },
      include: { user: { select: { id: true, email: true, displayName: true, avatarUrl: true } } },
    });
    if (!me) {
      throw new AuthError("Kein Zugriff auf diese Band.", 403);
    }

    return NextResponse.json({ me });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const bandId = parseUuid((await context.params).bandId, "Band-ID");
    await requireBandMembership(session.userId, bandId, { allowGuest: true });
    const payload = patchSchema.parse(await request.json());

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.appUser.update({
        where: { id: session.userId },
        data: { displayName: payload.displayName, avatarUrl: payload.avatarUrl },
        select: { id: true, email: true, displayName: true, avatarUrl: true },
      });
      const membership = await tx.bandMember.update({
        where: { bandId_userId: { bandId, userId: session.userId } },
        data: {
          instrumentPrimary: payload.instrumentPrimary === undefined ? undefined : payload.instrumentPrimary || null,
        },
        select: { id: true, userId: true, role: true, instrumentPrimary: true },
      });
      return { ...membership, user };
    });

    return NextResponse.json({ me: result });
  } catch (error) {
    return errorResponse(error, "Profil konnte nicht gespeichert werden.");
  }
}
