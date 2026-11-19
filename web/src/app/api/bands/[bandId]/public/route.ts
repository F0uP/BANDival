import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuthUser, requireBandAction, requireBandMembership, writeAuditLog } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse } from "@/lib/http";
import { parseLinks, MAX_PUBLIC_LINKS, publicLinkSchema } from "@/lib/public-band";

type Context = { params: Promise<{ bandId: string }> };

const select = { slug: true, publicEnabled: true, bio: true, genre: true, city: true, contactEmail: true, pressPhotoUrl: true, links: true } as const;

const patchSchema = z.object({
  publicEnabled: z.boolean().optional(),
  bio: z.string().max(5000).nullable().optional(),
  genre: z.string().trim().max(80).nullable().optional(),
  city: z.string().trim().max(80).nullable().optional(),
  contactEmail: z.string().trim().email().max(200).nullable().optional().or(z.literal("")),
  links: z.array(publicLinkSchema).max(MAX_PUBLIC_LINKS).optional(),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$/, "Nur Kleinbuchstaben, Zahlen und Bindestriche (3–50 Zeichen).").optional(),
});

export async function GET(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const bandId = parseUuid((await context.params).bandId, "Band-ID");
    await requireBandMembership(session.userId, bandId);
    const band = await prisma.band.findUniqueOrThrow({ where: { id: bandId }, select });
    return NextResponse.json({ public: { ...band, links: parseLinks(band.links) } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const bandId = parseUuid((await context.params).bandId, "Band-ID");
    await requireBandAction(session.userId, bandId, "public.manage");
    const payload = patchSchema.parse(await request.json());
    const text = (value: string | null | undefined) => (value === undefined ? undefined : value?.trim() || null);
    try {
      const band = await prisma.band.update({
        where: { id: bandId },
        data: {
          publicEnabled: payload.publicEnabled,
          bio: text(payload.bio),
          genre: text(payload.genre),
          city: text(payload.city),
          contactEmail: text(payload.contactEmail),
          links: payload.links === undefined ? undefined : (payload.links as unknown as Prisma.InputJsonValue),
          slug: payload.slug,
        },
        select,
      });
      await writeAuditLog({ bandId, actorUserId: session.userId, action: "band_updated", entityType: "band", entityId: bandId, payload: { public: band.publicEnabled } });
      return NextResponse.json({ public: { ...band, links: parseLinks(band.links) } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return NextResponse.json({ error: "Diese Adresse ist schon vergeben." }, { status: 409 });
      }
      throw error;
    }
  } catch (error) {
    return errorResponse(error, "Bandseite konnte nicht gespeichert werden.");
  }
}
