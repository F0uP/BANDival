import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuthUser, requireBandMembership } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse } from "@/lib/http";
import { isMailConfigured } from "@/lib/mailer";

const patchSchema = z.object({
  inAppEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  notifyInvites: z.boolean().optional(),
  notifyEvents: z.boolean().optional(),
  notifySetlists: z.boolean().optional(),
  notifySongs: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
  remindersEnabled: z.boolean().optional(),
  digestEnabled: z.boolean().optional(),
});

type Context = { params: Promise<{ bandId: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const bandId = parseUuid((await context.params).bandId, "Band-ID");
    await requireBandMembership(session.userId, bandId, { allowGuest: true });

    const preference = await prisma.notificationPreference.upsert({
      where: { userId_bandId: { userId: session.userId, bandId } },
      create: { userId: session.userId, bandId },
      update: {},
    });

    return NextResponse.json({ preference, emailAvailable: isMailConfigured() });
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

    const preference = await prisma.notificationPreference.upsert({
      where: { userId_bandId: { userId: session.userId, bandId } },
      create: { userId: session.userId, bandId, ...payload },
      update: payload,
    });

    return NextResponse.json({ preference, emailAvailable: isMailConfigured() });
  } catch (error) {
    return errorResponse(error, "Einstellungen konnten nicht gespeichert werden.");
  }
}
