"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Pause, Play, Repeat, RotateCcw, RotateCw, X } from "lucide-react";
import { cn } from "@/lib/client/cn";
import { formatDuration } from "@/lib/client/format";
import { usePlayer } from "@/components/providers/player";

const RATES = [0.75, 0.9, 1, 1.1, 1.25];

/** Compact player docked above the mobile tab bar / at the bottom on desktop. */
export function MiniPlayer() {
  const { track, playing, toggle, seekBy, audioRef, rate, setRate, loop, setLoop, close } = usePlayer();
  const [time, setTime] = useState({ current: 0, duration: 0 });

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const update = () => setTime({ current: audio.currentTime || 0, duration: Number.isFinite(audio.duration) ? audio.duration : 0 });
    audio.addEventListener("timeupdate", update);
    audio.addEventListener("loadedmetadata", update);
    audio.addEventListener("emptied", update);
    return () => {
      audio.removeEventListener("timeupdate", update);
      audio.removeEventListener("loadedmetadata", update);
      audio.removeEventListener("emptied", update);
    };
  }, [audioRef]);

  if (!track) {
    return null;
  }

  const progress = time.duration > 0 ? (time.current / time.duration) * 100 : 0;

  return (
    <div className="fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 [animation:rise-in_480ms_var(--ease-out)] lg:inset-x-auto lg:bottom-5 lg:left-[calc(16rem+2.5rem)] lg:right-10">
      <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-border bg-surface/95 shadow-float backdrop-blur">
        <div className="flex items-center gap-2 px-2.5 py-2 sm:gap-3 sm:px-3">
          <button
            type="button"
            onClick={toggle}
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg transition-transform active:scale-95"
            aria-label={playing ? "Pause" : "Abspielen"}
          >
            {playing ? <Pause className="size-4 fill-current" /> : <Play className="ml-0.5 size-4 fill-current" />}
          </button>
          <div className="min-w-0 flex-1">
            {track.songId ? (
              <Link href={`/app/songs/${track.songId}`} className="block truncate text-sm font-medium hover:underline">{track.title}</Link>
            ) : (
              <span className="block truncate text-sm font-medium">{track.title}</span>
            )}
            <span className="block truncate text-xs text-muted">
              {formatDuration(time.current) === "–" ? "0:00" : formatDuration(time.current)} / {formatDuration(time.duration)}
              {track.subtitle ? ` · ${track.subtitle}` : ""}
            </span>
          </div>
          <div className="flex items-center">
            <button type="button" onClick={() => seekBy(-10)} className="hidden size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg sm:inline-flex" aria-label="10 Sekunden zurück">
              <RotateCcw className="size-4" />
            </button>
            <button type="button" onClick={() => seekBy(10)} className="hidden size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg sm:inline-flex" aria-label="10 Sekunden vor">
              <RotateCw className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setRate(RATES[(RATES.indexOf(rate) + 1) % RATES.length] ?? 1)}
              className="inline-flex h-9 min-w-11 items-center justify-center rounded-lg px-1.5 text-xs font-semibold text-muted hover:bg-surface-2 hover:text-fg"
              aria-label="Wiedergabegeschwindigkeit"
              title="Tempo zum Üben"
            >
              {rate}×
            </button>
            <button
              type="button"
              onClick={() => setLoop(!loop)}
              className={cn("inline-flex size-9 items-center justify-center rounded-lg hover:bg-surface-2", loop ? "text-accent-text" : "text-muted hover:text-fg")}
              aria-label="Wiederholen"
              aria-pressed={loop}
            >
              <Repeat className="size-4" />
            </button>
            <button type="button" onClick={close} className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg" aria-label="Player schließen">
              <X className="size-4" />
            </button>
          </div>
        </div>
        <input
          type="range"
          min={0}
          max={Math.max(1, time.duration)}
          step={0.1}
          value={Math.min(time.current, time.duration || 0)}
          onChange={(event) => {
            if (audioRef.current) audioRef.current.currentTime = Number(event.target.value);
          }}
          aria-label="Position"
          className="block h-1 w-full cursor-pointer appearance-none bg-surface-2 accent-[var(--accent)]"
          style={{ background: `linear-gradient(to right, var(--accent) ${progress}%, var(--surface-2) ${progress}%)` }}
        />
      </div>
    </div>
  );
}
