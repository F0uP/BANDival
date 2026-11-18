"use client";

import { useState, useSyncExternalStore } from "react";
import { Play } from "lucide-react";
import { cn } from "@/lib/client/cn";
import { spotifyEmbed } from "@/lib/social-links";
import { SocialIcon } from "@/components/public/social-icon";

const CONSENT_KEY = "bandival.consent.spotify";
const CONSENT_EVENT = "bandival:consent";

function readConsent(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === "1";
  } catch {
    return false;
  }
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(CONSENT_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CONSENT_EVENT, callback);
  };
}

/**
 * Spotify player for the public band page. Two-click solution: nothing is loaded from Spotify
 * (no cookies, no requests) until the visitor agrees – the choice can be remembered.
 */
export function SpotifyPlayer({ defaultUrl, tracks }: { defaultUrl: string | null; tracks: Array<{ id: string; title: string; url: string }> }) {
  const remembered = useSyncExternalStore(subscribe, readConsent, () => false);
  const [accepted, setAccepted] = useState(false);
  const [current, setCurrent] = useState(defaultUrl ?? tracks[0]?.url ?? null);
  const [remember, setRemember] = useState(false);
  const embed = spotifyEmbed(current);
  if (!embed) return null;
  const consent = accepted || remembered;

  const accept = () => {
    setAccepted(true);
    if (remember) {
      try {
        localStorage.setItem(CONSENT_KEY, "1");
        window.dispatchEvent(new Event(CONSENT_EVENT));
      } catch {
        /* private mode – the choice simply isn't remembered */
      }
    }
  };

  return (
    <div className="space-y-3">
      {consent ? (
        <iframe
          key={embed.src}
          title="Spotify-Player"
          src={embed.src}
          width="100%"
          height={embed.height}
          loading="lazy"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          className="w-full rounded-[14px] border-0 [animation:rise-in_500ms_var(--ease-out)]"
        />
      ) : (
        <div className="flex flex-col gap-4 rounded-[16px] border border-border bg-surface p-5 sm:flex-row sm:items-center" style={{ minHeight: embed.height }}>
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#1ed760]/15 text-[#1db954]"><SocialIcon kind="spotify" className="size-6" /></span>
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold">Auf Spotify reinhören</p>
            <p className="mt-1 leading-relaxed text-muted">
              Beim Laden des Players werden Daten an Spotify übertragen und ggf. Cookies gesetzt.
            </p>
            <label className="mt-2 inline-flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} className="accent-[var(--accent)]" />
              Entscheidung merken
            </label>
          </div>
          <button type="button" onClick={accept} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-ink px-5 text-sm font-medium text-ink-fg transition-transform active:scale-95">
            <Play className="size-4 fill-current" /> Player laden
          </button>
        </div>
      )}
      {tracks.length > 1 || (tracks.length === 1 && defaultUrl && tracks[0].url !== defaultUrl) ? (
        <div className="flex flex-wrap gap-2">
          {defaultUrl ? (
            <button type="button" onClick={() => setCurrent(defaultUrl)} className={cn("rounded-full border px-3 py-1.5 text-[13px] transition-colors", current === defaultUrl ? "border-fg bg-ink text-ink-fg" : "border-border hover:border-border-strong")}>
              {spotifyEmbed(defaultUrl)?.label ?? "Spotify"}
            </button>
          ) : null}
          {tracks.map((track) => (
            <button
              key={track.id}
              type="button"
              onClick={() => setCurrent(track.url)}
              className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] transition-colors", current === track.url ? "border-fg bg-ink text-ink-fg" : "border-border hover:border-border-strong")}
            >
              <Play className="size-3 fill-current" />{track.title}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
