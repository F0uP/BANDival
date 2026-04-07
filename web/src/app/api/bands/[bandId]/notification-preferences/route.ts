import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AuthError, requireAuthUser, requireBandMembership } from "@/lib/auth";

const patchSchema = z.object({
  inAppEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  notifyInvites: z.boolean().optional(),
  notifyEvents: z.boolean().optional(),
  notifySetlists: z.boolean().optional(),
  notifySongs: z.boolean().optional(),
});

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ bandId: string }> },
) {
  try {
    const session = await requireAuthUser(request);
    const { bandId } = await context.params;
    await requireBandMembership(session.userId, bandId);

    const preference = await prisma.notificationPreference.upsert({
      where: {
        userId_bandId: {
          userId: session.userId,
          bandId,
        },
      },
      create: {
        userId: session.userId,
        bandId,
      },
      update: {},
    });

    return NextResponse.json({ preference });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load preferences." },
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

    const preference = await prisma.notificationPreference.upsert({
      where: {
        userId_bandId: {
          userId: session.userId,
          bandId,
        },
      },
      create: {
        userId: session.userId,
        bandId,
        ...payload,
      },
      update: payload,
    });

    return NextResponse.json({ preference });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update preferences." },
      { status: 400 },
    );
  }
}
