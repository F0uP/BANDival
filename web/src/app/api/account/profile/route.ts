import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuthUser } from "@/lib/auth";
import { errorResponse } from "@/lib/http";

const ntfyUrl = z
  .string()
  .trim()
  .url("Ungültige ntfy-Adresse.")
  .refine((value) => /^https?:\/\/[^/]+\/[A-Za-z0-9_-]{3,64}$/.test(value), "Format: https://ntfy.sh/mein-geheimes-thema");

const schema = z.object({
  displayName: z.string().trim().min(1, "Der Name darf nicht leer sein.").max(100).optional(),
  avatarUrl: z.union([z.string().url(), z.string().startsWith("/uploads/")]).nullable().optional(),
  ntfyTopicUrl: z.union([ntfyUrl, z.literal("")]).nullable().optional(),
});

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const payload = schema.parse(await request.json());
    const user = await prisma.appUser.update({
      where: { id: session.userId },
      data: {
        displayName: payload.displayName,
        avatarUrl: payload.avatarUrl,
        ntfyTopicUrl: payload.ntfyTopicUrl === undefined ? undefined : payload.ntfyTopicUrl || null,
      },
      select: { id: true, email: true, displayName: true, avatarUrl: true, ntfyTopicUrl: true },
    });

    return NextResponse.json({ user });
  } catch (error) {
    return errorResponse(error, "Profil konnte nicht gespeichert werden.");
  }
}
