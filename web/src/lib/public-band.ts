import { cache } from "react";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { detectLinkKind, LINK_KINDS, spotifyEmbed, type PublicLink } from "@/lib/social-links";

export const publicLinkSchema = z.object({
  label: z.string().trim().min(1).max(40),
  url: z.string().trim().url().max(500).refine((value) => /^https?:\/\//i.test(value), "Nur http(s)-Links."),
  kind: z.enum(LINK_KINDS).optional(),
}).refine((link) => link.kind !== "player" || spotifyEmbed(link.url) !== null, {
  message: "Der Spotify-Player braucht einen Link von open.spotify.com (Song, Album, Profil oder Playlist).",
  path: ["url"],
});

export const MAX_PUBLIC_LINKS = 30;

/** Links with their type – older links without a type are recognised by their address. */
export function parseLinks(value: unknown): PublicLink[] {
  const result = z.array(publicLinkSchema).max(MAX_PUBLIC_LINKS).safeParse(value ?? []);
  return result.success ? result.data.map((link) => ({ ...link, kind: link.kind ?? detectLinkKind(link.url) })) : [];
}

/** Public press kit data – only what the band explicitly published (deduplicated per request). */
export const loadPublicBand = cache(async (slug: string) => {
  const band = await prisma.band.findFirst({
    where: { slug, publicEnabled: true },
    select: { id: true, name: true, slug: true, bio: true, description: true, genre: true, city: true, contactEmail: true, pressPhotoUrl: true, links: true, timezone: true },
  });
  if (!band) return null;
  const [gigs, songs] = await Promise.all([
    prisma.event.findMany({
      where: { bandId: band.id, kind: "gig", isPublic: true, status: { not: "cancelled" }, startsAt: { gte: new Date(Date.now() - 6 * 3600_000) } },
      orderBy: { startsAt: "asc" },
      take: 30,
      select: { id: true, title: true, startsAt: true, endsAt: true, venueLabel: true, doorsAt: true, updatedAt: true, status: true },
    }),
    prisma.song.findMany({
      where: { bandId: band.id, isPublic: true, workflowStatus: { not: "archived" } },
      orderBy: [{ albumTrackNo: "asc" }, { title: "asc" }],
      take: 30,
      select: { id: true, title: true, durationSeconds: true, spotifyUrl: true, audioVersions: { where: { isCurrent: true }, take: 1, select: { id: true } } },
    }),
  ]);
  return { band: { ...band, links: parseLinks(band.links) }, gigs, songs };
});
