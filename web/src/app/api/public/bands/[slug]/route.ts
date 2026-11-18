import { NextRequest, NextResponse } from "next/server";
import { loadPublicBand } from "@/lib/public-band";

export const dynamic = "force-dynamic";

/** Public press kit JSON (no login) – only published data. */
export async function GET(_request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const data = await loadPublicBand((await context.params).slug);
  if (!data) return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
  const { band, gigs, songs } = data;
  return NextResponse.json({
    band: { name: band.name, slug: band.slug, bio: band.bio ?? band.description, genre: band.genre, city: band.city, contactEmail: band.contactEmail, links: band.links, photo: band.pressPhotoUrl ? `/api/public/bands/${band.slug}/photo` : null },
    gigs: gigs.map((gig) => ({ title: gig.title, startsAt: gig.startsAt, venue: gig.venueLabel, doorsAt: gig.doorsAt, status: gig.status })),
    songs: songs.map((song) => ({ title: song.title, durationSeconds: song.durationSeconds, audio: song.audioVersions[0] ? `/api/public/bands/${band.slug}/audio/${song.id}` : null, link: song.spotifyUrl })),
  }, { headers: { "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" } });
}
