import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthUser } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { cookieBannerEnabled, getLegalContent, LEGAL_SLUGS, MAX_LEGAL_LENGTH, requireInstanceAdmin, saveLegalContent, setCookieBanner, type LegalSlug } from "@/lib/legal";
import { legalTemplate } from "@/lib/legal-templates";

const putSchema = z.union([
  z.object({ slug: z.enum(LEGAL_SLUGS as [LegalSlug, ...LegalSlug[]]), content: z.string().max(MAX_LEGAL_LENGTH).nullable() }),
  z.object({ cookieBanner: z.boolean() }),
]);

async function snapshot() {
  const pages = await Promise.all(LEGAL_SLUGS.map(async (slug) => ({ ...(await getLegalContent(slug)), template: legalTemplate(slug) })));
  return { pages, cookieBanner: await cookieBannerEnabled() };
}

/** Legal pages and cookie notice – instance administrators only. */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    await requireInstanceAdmin(session.userId);
    return NextResponse.json(await snapshot());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    await requireInstanceAdmin(session.userId);
    const payload = putSchema.parse(await request.json());
    if ("slug" in payload) await saveLegalContent(payload.slug, payload.content);
    else await setCookieBanner(payload.cookieBanner);
    return NextResponse.json(await snapshot());
  } catch (error) {
    return errorResponse(error, "Rechtstexte konnten nicht gespeichert werden.");
  }
}
