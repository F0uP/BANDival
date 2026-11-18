import { NextRequest, NextResponse } from "next/server";
import { requireAuthUser, requireBandAction } from "@/lib/auth";
import { parseBandId } from "@/lib/api";
import { errorResponse, HttpError } from "@/lib/http";

let token: { value: string; expiresAt: number } | null = null;

async function spotifyToken(): Promise<string> {
  const id = process.env.SPOTIFY_CLIENT_ID?.trim();
  const secret = process.env.SPOTIFY_CLIENT_SECRET?.trim();
  if (!id || !secret) throw new HttpError("Spotify-Import ist nicht eingerichtet (SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET).", 501);
  if (token && token.expiresAt > Date.now() + 30_000) return token.value;
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(10_000),
  });
  const data = await response.json().catch(() => null) as { access_token?: string; expires_in?: number } | null;
  if (!response.ok || !data?.access_token) throw new HttpError("Spotify-Anmeldung fehlgeschlagen – Client-ID/Secret prüfen.", 502);
  token = { value: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return token.value;
}

type Track = { name: string; duration_ms: number; external_urls?: { spotify?: string } };

/** Reads a public Spotify playlist or album (titles, durations, links) for the song import. */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const bandId = parseBandId(request.nextUrl.searchParams.get("bandId"));
    await requireBandAction(session.userId, bandId, "songs.create");
    const url = request.nextUrl.searchParams.get("url") ?? "";
    const match = /(playlist|album)[/:]([A-Za-z0-9]{10,40})/.exec(url);
    if (!match) throw new HttpError("Bitte einen Spotify-Link zu einer Playlist oder einem Album einfügen.", 400);
    const [, kind, id] = match;
    const headers = { Authorization: `Bearer ${await spotifyToken()}` };
    const tracks: Track[] = [];
    let next: string | null = kind === "playlist"
      ? `https://api.spotify.com/v1/playlists/${id}/tracks?limit=100&fields=next,items(track(name,duration_ms,external_urls))`
      : `https://api.spotify.com/v1/albums/${id}/tracks?limit=50`;
    while (next && tracks.length < 300) {
      if (!next.startsWith("https://api.spotify.com/")) break;
      const response: Response = await fetch(next, { headers, signal: AbortSignal.timeout(15_000) });
      if (response.status === 404) throw new HttpError("Playlist/Album nicht gefunden oder nicht öffentlich.", 404);
      if (!response.ok) throw new HttpError(`Spotify antwortet mit Fehler ${response.status}.`, 502);
      const page = await response.json() as { next: string | null; items: Array<{ track?: Track } | Track> };
      for (const item of page.items) {
        const track = "track" in item && item.track ? item.track : (item as Track);
        if (track?.name) tracks.push(track);
      }
      next = page.next;
    }
    return NextResponse.json({
      songs: tracks.map((track) => ({
        title: track.name.slice(0, 200),
        durationSeconds: Math.round(track.duration_ms / 1000) || null,
        spotifyUrl: track.external_urls?.spotify ?? null,
      })),
    });
  } catch (error) {
    return errorResponse(error, "Spotify-Import fehlgeschlagen.");
  }
}
