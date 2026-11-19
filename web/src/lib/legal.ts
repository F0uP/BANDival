import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/http";
import { legalTemplate, type LegalSlug } from "@/lib/legal-templates";

export type { LegalSlug } from "@/lib/legal-templates";

/** German source titles – translated for display with t(). */
export const LEGAL_PAGES: Array<{ slug: LegalSlug; title: string }> = [
  { slug: "impressum", title: "Impressum" },
  { slug: "datenschutz", title: "Datenschutzerklärung" },
  { slug: "agb", title: "AGB" },
];

export const LEGAL_SLUGS = LEGAL_PAGES.map((page) => page.slug);
export const MAX_LEGAL_LENGTH = 100_000;

const contentKey = (slug: LegalSlug) => `legal.${slug}`;
const BANNER_KEY = "legal.cookieBanner";

export type LegalContent = { slug: LegalSlug; content: string; custom: boolean; updatedAt: string | null };

/** Saved text of a legal page – or the generated German template while the operator hasn't edited it yet. */
export const getLegalContent = cache(async (slug: LegalSlug): Promise<LegalContent> => {
  const saved = await prisma.appSetting.findUnique({ where: { key: contentKey(slug) } }).catch(() => null);
  if (saved?.value.trim()) return { slug, content: saved.value, custom: true, updatedAt: saved.updatedAt.toISOString() };
  return { slug, content: legalTemplate(slug), custom: false, updatedAt: null };
});

/** `null` resets the page to the template. */
export async function saveLegalContent(slug: LegalSlug, content: string | null): Promise<void> {
  if (content === null || !content.trim()) {
    await prisma.appSetting.deleteMany({ where: { key: contentKey(slug) } });
    return;
  }
  await prisma.appSetting.upsert({ where: { key: contentKey(slug) }, create: { key: contentKey(slug), value: content }, update: { value: content } });
}

/** The cookie notice is on by default; operators can switch it off (e.g. when a reverse proxy shows its own). */
export const cookieBannerEnabled = cache(async (): Promise<boolean> => {
  const setting = await prisma.appSetting.findUnique({ where: { key: BANNER_KEY } }).catch(() => null);
  return setting?.value !== "off";
});

export async function setCookieBanner(enabled: boolean): Promise<void> {
  const value = enabled ? "on" : "off";
  await prisma.appSetting.upsert({ where: { key: BANNER_KEY }, create: { key: BANNER_KEY, value }, update: { value } });
}

/**
 * Instance administrators maintain instance-wide settings such as the legal pages.
 * INSTANCE_ADMIN_EMAILS (comma separated) decides; without it, the oldest account – usually
 * the person who set the instance up – is the administrator.
 */
export async function isInstanceAdmin(userId: string): Promise<boolean> {
  const configured = (process.env.INSTANCE_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  if (configured.length > 0) {
    const user = await prisma.appUser.findUnique({ where: { id: userId }, select: { email: true } });
    return Boolean(user && configured.includes(user.email.toLowerCase()));
  }
  const first = await prisma.appUser.findFirst({ orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true } });
  return first?.id === userId;
}

export async function requireInstanceAdmin(userId: string): Promise<void> {
  if (!(await isInstanceAdmin(userId))) throw new HttpError("Nur die Administration dieser Instanz kann das ändern.", 403);
}
