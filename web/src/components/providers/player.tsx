"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { t } from "@/lib/i18n";

export type Track = {
  url: string;
  title: string;
  subtitle?: string;
  songId?: string;
};

type PlayerContextValue = {
  track: Track | null;
  playing: boolean;
  rate: number;
  loop: boolean;
  audioRef: RefObject<HTMLAudioElement | null>;
  play: (track: Track) => void;
  toggle: () => void;
  seekBy: (seconds: number) => void;
  setRate: (rate: number) => void;
  setLoop: (loop: boolean) => void;
  close: () => void;
};

const PlayerContext = createContext<PlayerContextValue | null>(null);

/** Global audio player – keeps playing while navigating between pages. */
export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [track, setTrack] = useState<Track | null>(null);
  const [playing, setPlaying] = useState(false);
  const [rate, setRateState] = useState(1);
  const [loop, setLoopState] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onPause);
    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onPause);
    };
  }, []);

  // Media Session: lock screen / headset controls on phones.
  useEffect(() => {
    if (!track || !("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title: track.title, artist: track.subtitle ?? "Bandival" });
    navigator.mediaSession.setActionHandler("play", () => void audioRef.current?.play());
    navigator.mediaSession.setActionHandler("pause", () => audioRef.current?.pause());
    navigator.mediaSession.setActionHandler("seekbackward", () => {
      if (audioRef.current) audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 10);
    });
    navigator.mediaSession.setActionHandler("seekforward", () => {
      if (audioRef.current) audioRef.current.currentTime += 10;
    });
  }, [track]);

  const play = useCallback((next: Track) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (track?.url !== next.url) {
      audio.src = next.url;
      audio.playbackRate = rate;
    }
    setTrack(next);
    void audio.play().catch(() => setPlaying(false));
  }, [rate, track?.url]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !track) return;
    if (audio.paused) {
      void audio.play().catch(() => undefined);
    } else {
      audio.pause();
    }
  }, [track]);

  const seekBy = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const max = Number.isFinite(audio.duration) ? audio.duration : audio.currentTime + seconds;
    audio.currentTime = Math.min(Math.max(0, audio.currentTime + seconds), max);
  }, []);

  const setRate = useCallback((value: number) => {
    setRateState(value);
    if (audioRef.current) audioRef.current.playbackRate = value;
  }, []);

  const setLoop = useCallback((value: boolean) => {
    setLoopState(value);
    if (audioRef.current) audioRef.current.loop = value;
  }, []);

  const close = useCallback(() => {
    audioRef.current?.pause();
    setTrack(null);
  }, []);

  const value = useMemo(() => ({ track, playing, rate, loop, audioRef, play, toggle, seekBy, setRate, setLoop, close }), [
    close, loop, play, playing, rate, seekBy, setLoop, setRate, toggle, track,
  ]);

  return (
    <PlayerContext.Provider value={value}>
      {children}
      <audio ref={audioRef} preload="metadata" className="hidden" />
    </PlayerContext.Provider>
  );
}

export function usePlayer(): PlayerContextValue {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error(t("usePlayer must be used inside <PlayerProvider>"));
  }
  return context;
}
