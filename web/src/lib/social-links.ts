/** Link types of the public band page – shared by server, settings UI and the page itself. */
export const LINK_KINDS = [
  "instagram", "spotify", "youtube", "tiktok", "facebook", "bandcamp", "soundcloud", "apple_music", "deezer", "x",
  "website", "merch", "player", "custom",
] as const;

export type LinkKind = (typeof LINK_KINDS)[number];
export type PublicLink = { label: string; url: string; kind: LinkKind };

export const SOCIAL_PLATFORMS: Array<{ kind: LinkKind; label: string; placeholder: string }> = [
  { kind: "instagram", label: "Instagram", placeholder: "instagram.com/eureband" },
  { kind: "spotify", label: "Spotify", placeholder: "open.spotify.com/artist/…" },
  { kind: "youtube", label: "YouTube", placeholder: "youtube.com/@eureband" },
  { kind: "tiktok", label: "TikTok", placeholder: "tiktok.com/@eureband" },
  { kind: "facebook", label: "Facebook", placeholder: "facebook.com/eureband" },
  { kind: "bandcamp", label: "Bandcamp", placeholder: "eureband.bandcamp.com" },
  { kind: "soundcloud", label: "SoundCloud", placeholder: "soundcloud.com/eureband" },
  { kind: "apple_music", label: "Apple Music", placeholder: "music.apple.com/…" },
  { kind: "deezer", label: "Deezer", placeholder: "deezer.com/artist/…" },
  { kind: "x", label: "X / Twitter", placeholder: "x.com/eureband" },
  { kind: "website", label: "Website", placeholder: "eure-band.de" },
];

const HOSTS: Array<[RegExp, LinkKind]> = [
  [/(^|\.)instagram\.com$/, "instagram"],
  [/(^|\.)(spotify\.com|spotify\.link)$/, "spotify"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "youtube"],
  [/(^|\.)tiktok\.com$/, "tiktok"],
  [/(^|\.)(facebook\.com|fb\.com)$/, "facebook"],
  [/(^|\.)bandcamp\.com$/, "bandcamp"],
  [/(^|\.)soundcloud\.com$/, "soundcloud"],
  [/(^|\.)music\.apple\.com$/, "apple_music"],
  [/(^|\.)deezer\.(com|page\.link)$/, "deezer"],
  [/(^|\.)(x\.com|twitter\.com)$/, "x"],
];

/** Recognises the platform of a URL (for links saved before link types existed). */
export function detectLinkKind(url: string): LinkKind {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return HOSTS.find(([pattern]) => pattern.test(host))?.[1] ?? "custom";
  } catch {
    return "custom";
  }
}

/** Accepts "instagram.com/band" as well as full URLs. */
export function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

const SPOTIFY_TYPE_LABEL: Record<string, string> = { track: "Song", album: "Album", artist: "Künstlerprofil", playlist: "Playlist", episode: "Episode", show: "Podcast" };

/** open.spotify.com URL → official embed player URL (or null if it is not a Spotify item link). */
export function spotifyEmbed(url: string | null | undefined): { src: string; height: number; type: string; label: string } | null {
  if (!url) return null;
  const match = url.match(/^https:\/\/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(?:embed\/)?(track|album|artist|playlist|episode|show)\/([A-Za-z0-9]{10,40})/);
  if (!match) return null;
  const [, type, id] = match;
  return {
    src: `https://open.spotify.com/embed/${type}/${id}?utm_source=generator`,
    height: type === "track" || type === "episode" ? 152 : 352,
    type,
    label: SPOTIFY_TYPE_LABEL[type] ?? type,
  };
}
