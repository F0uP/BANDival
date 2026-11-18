"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Hand, ListMusic, Maximize, Megaphone, Minimize, Minus, MessageSquareText,
  Pause, Play, Plus, Radio, SlidersHorizontal, Timer, Vibrate, Volume2, VolumeX, X, Zap,
} from "lucide-react";
import { cn } from "@/lib/client/cn";
import { formatDuration, formatTotalDuration } from "@/lib/client/format";
import { useRehearsalNotes, useSetlist, useSong, useSongParts, useSongScores } from "@/lib/client/hooks";
import { transposeKey } from "@/lib/client/music";
import { meterForMetronome, sharedMetronome, type MetronomeConfig } from "@/lib/client/live-metronome";
import { pulseHub } from "@/lib/client/pulse";
import { useLiveSync, type LiveState } from "@/lib/client/live-sync";
import { sanitizeScore } from "@/lib/notation/model";
import { Dialog } from "@/components/ui/dialog";
import { Segmented } from "@/components/ui/navigation";
import { useSession } from "@/components/providers/session";
import { ChordSheet, LyricsText } from "@/components/songs/chord-sheet";
import { PartView } from "@/components/songs/song-parts";
import { ScoreRenderer } from "@/components/notation/score-renderer";
import { PulsePanel, usePulse } from "@/components/live/pulse-panel";

type AndroidBridge = { setKeepScreenOn?: (on: boolean) => void };
type View = "chords" | "lyrics" | "scores" | "part";

function useKeepAwake() {
  useEffect(() => {
    let sentinel: WakeLockSentinel | null = null;
    const android = (window as unknown as { BandivalAndroid?: AndroidBridge }).BandivalAndroid;
    android?.setKeepScreenOn?.(true);
    const request = async () => {
      try {
        sentinel = (await navigator.wakeLock?.request("screen")) ?? null;
      } catch {
        sentinel = null;
      }
    };
    void request();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void request();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      void sentinel?.release().catch(() => undefined);
      android?.setKeepScreenOn?.(false);
    };
  }, []);
}

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function readPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`bandival.stage.${key}`);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function writePref(key: string, value: unknown) {
  try {
    localStorage.setItem(`bandival.stage.${key}`, JSON.stringify(value));
  } catch {
    // per-device convenience only
  }
}

function IconButton({ onClick, label, children, active, className }: { onClick: () => void; label: string; children: React.ReactNode; active?: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-xl transition-colors [&_svg]:size-5",
        active ? "bg-accent text-accent-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
        className,
      )}
    >
      {children}
    </button>
  );
}

function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

export function StageMode({ setlistId }: { setlistId: string }) {
  const { band, me } = useSession();
  const { data } = useSetlist(setlistId);
  const notes = useRehearsalNotes(band?.role === "guest" ? null : setlistId);
  const items = useMemo(() => data?.setlist.items ?? [], [data]);
  const [index, setIndex] = useState(0);
  const current = items[Math.min(index, Math.max(0, items.length - 1))];
  const next = items[index + 1];
  const afterNext = items[index + 2];
  const song = useSong(current?.song.id ?? null);
  useSong(next?.song.id ?? null); // prefetch for instant/offline switching
  const scores = useSongScores(current?.song.id ?? null);
  const parts = useSongParts(current?.song.id ?? null);

  const [transposeBySong, setTransposeBySong] = useState<Record<string, number>>({});
  const [bpmBySong, setBpmBySong] = useState<Record<string, number>>({});
  const [fontSize, setFontSize] = useState(() => readPref("fontSize", 24));
  const [view, setView] = useState<View>("chords");
  const [myPart, setMyPart] = useState<string>(() => readPref("part", ""));
  const [scrolling, setScrolling] = useState(false);
  const [speed, setSpeed] = useState(3);
  const [showNotes, setShowNotes] = useState(true);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [metronomeOn, setMetronomeOn] = useState(false);
  const [metronomeBar, setMetronomeBar] = useState(() => readPref("metronomeBar", true));
  const [sound, setSound] = useState(() => readPref("sound", true));
  const [countIn, setCountIn] = useState(() => readPref("countIn", true));
  const [autoStart, setAutoStart] = useState(() => readPref("autoStart", false));
  const [flashEnabled, setFlashEnabled] = useState(() => readPref("flash", true));
  const [beat, setBeat] = useState<{ beat: number; accent: boolean; countIn: boolean } | null>(null);
  const [flash, setFlash] = useState<"accent" | "beat" | null>(null);
  const [setStartedAt, setSetStartedAt] = useState<number | null>(null);
  const [songStartedAt, setSongStartedAt] = useState(() => Date.now());
  const [leading, setLeading] = useState(false);
  const [followingKey, setFollowingKey] = useState<string | null>(null);
  const [ignoredKey, setIgnoredKey] = useState<string | null>(null);
  const [autoFollow, setAutoFollow] = useState(() => readPref("autoFollow", true));
  const [followSongs, setFollowSongs] = useState(() => readPref("followSongs", true));
  const [outputDelay, setOutputDelay] = useState(() => readPref("outputDelay", 0));
  const [announcement, setAnnouncement] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const taps = useRef<number[]>([]);
  const now = useNow();
  const pulse = usePulse();
  const pulseActive = pulse.devices.some((device) => device.status === "connected");

  useKeepAwake();

  useEffect(() => writePref("fontSize", fontSize), [fontSize]);
  useEffect(() => writePref("part", myPart), [myPart]);
  useEffect(() => writePref("metronomeBar", metronomeBar), [metronomeBar]);
  useEffect(() => writePref("sound", sound), [sound]);
  useEffect(() => writePref("countIn", countIn), [countIn]);
  useEffect(() => writePref("autoStart", autoStart), [autoStart]);
  useEffect(() => writePref("flash", flashEnabled), [flashEnabled]);
  useEffect(() => writePref("autoFollow", autoFollow), [autoFollow]);
  useEffect(() => writePref("followSongs", followSongs), [followSongs]);
  useEffect(() => {
    writePref("outputDelay", outputDelay);
    sharedMetronome().outputDelayMs = outputDelay;
  }, [outputDelay]);

  // Offline: load every lead sheet, part and score of the setlist into the offline cache (service worker).
  const [offlineReady, setOfflineReady] = useState(false);
  useEffect(() => {
    if (items.length === 0) return;
    let cancelled = false;
    void Promise.allSettled(items.flatMap((item) => [
      fetch(`/api/songs/${item.song.id}`, { credentials: "same-origin" }),
      fetch(`/api/songs/${item.song.id}/parts`, { credentials: "same-origin" }),
      fetch(`/api/songs/${item.song.id}/scores`, { credentials: "same-origin" }),
    ])).then((results) => {
      if (!cancelled) setOfflineReady(results.every((result) => result.status === "fulfilled"));
    });
    return () => {
      cancelled = true;
    };
  }, [items]);

  /* ---------- Metronome ---------- */

  const songBpm = current ? bpmBySong[current.song.id] ?? (Number(current.song.tempoBpm) || 0) : 0;
  const bpm = songBpm || 100;
  const meter = meterForMetronome(song.data?.song.timeSignature ?? null);

  const metronomeConfig = useCallback((overrides: Partial<MetronomeConfig> = {}): MetronomeConfig => ({
    bpm,
    beatsPerBar: meter.beatsPerBar,
    beatUnit: meter.beatUnit,
    subdivision: meter.subdivision,
    sound,
    volume: 0.9,
    countInBars: countIn ? 1 : 0,
    ...overrides,
  }), [bpm, countIn, meter.beatUnit, meter.beatsPerBar, meter.subdivision, sound]);

  useEffect(() => {
    let timeout = 0;
    const unsubscribe = sharedMetronome().subscribe((info) => {
      setBeat({ beat: info.beat, accent: info.accent, countIn: info.countIn });
      setFlash(info.accent ? "accent" : "beat");
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => setFlash(null), 120);
      pulseHub.beat(info);
    });
    return () => {
      unsubscribe();
      window.clearTimeout(timeout);
    };
  }, []);

  useEffect(() => () => {
    sharedMetronome().stop();
    pulseHub.stop();
  }, []);

  const metronomeLiveState = (config: MetronomeConfig, grid: number): LiveState["metronome"] => ({
    running: true, bpm: config.bpm, beatsPerBar: config.beatsPerBar, beatUnit: config.beatUnit, countInBars: config.countInBars, gridStartEpochMs: grid,
  });

  /* Whoever starts the click leads; everybody else follows automatically (server sync – the Android app also syncs offline). */
  const live = useLiveSync(setlistId, true, (state: LiveState | null, offset: number) => {
    if (!state || (state.leaderId === me?.userId && leading)) return;
    const engine = sharedMetronome();
    if (!state.metronome?.running) {
      if (followingKey) {
        engine.stop();
        pulseHub.stop();
        setMetronomeOn(false);
        setFollowingKey(null);
      }
      return;
    }
    if (state.leaderId === me?.userId) return;
    if (leading) setLeading(false); // someone else started a newer click – they lead now
    const key = `${state.leaderId}:${Math.round(state.metronome.gridStartEpochMs)}:${state.metronome.bpm}`;
    if (!autoFollow || key === ignoredKey) return;
    const localGrid = state.metronome.gridStartEpochMs - offset;
    if (key !== followingKey || !engine.running) {
      const config: MetronomeConfig = {
        bpm: state.metronome.bpm,
        beatsPerBar: state.metronome.beatsPerBar,
        beatUnit: state.metronome.beatUnit,
        subdivision: 1,
        sound,
        volume: 0.9,
        countInBars: state.metronome.countInBars,
      };
      engine.start(config, localGrid);
      pulseHub.start(config, Math.max(Date.now(), localGrid), current?.song.title);
      setMetronomeOn(true);
      setFollowingKey(key);
    } else if (Math.abs(engine.gridStartEpochMs - localGrid) > 3) {
      engine.align(localGrid);
    }
    if (followSongs) {
      const target = state.songId ? items.findIndex((item) => item.song.id === state.songId) : state.index;
      if (target >= 0 && target !== index) {
        setIndex(target);
        setScrolling(false);
        setSongStartedAt(Date.now());
        scrollRef.current?.scrollTo({ top: 0 });
      }
    }
  });

  const publishLive = useCallback((nextIndex: number, metronome: LiveState["metronome"] | undefined, message?: string | null) => {
    void live.publish({ index: nextIndex, songId: items[nextIndex]?.song.id ?? null, metronome, message });
  }, [items, live]);

  const startMetronome = useCallback((config: MetronomeConfig, title?: string) => {
    const engine = sharedMetronome();
    engine.start(config);
    pulseHub.start(config, engine.gridStartEpochMs, title);
    setMetronomeOn(true);
    setSetStartedAt((value) => value ?? Date.now());
    return engine.gridStartEpochMs;
  }, []);

  const stopMetronome = useCallback(() => {
    sharedMetronome().stop();
    pulseHub.stop();
    setMetronomeOn(false);
    setBeat(null);
  }, []);

  /** Starts the click on this device and makes it the stage leader. */
  const lead = useCallback((config: MetronomeConfig, nextIndex: number, title?: string) => {
    const grid = startMetronome(config, title);
    setLeading(true);
    setFollowingKey(null);
    publishLive(nextIndex, metronomeLiveState(config, grid));
  }, [publishLive, startMetronome]);

  const toggleMetronome = useCallback(() => {
    if (metronomeOn) {
      stopMetronome();
      if (leading) {
        setLeading(false);
        publishLive(index, null);
      }
      if (followingKey) {
        setIgnoredKey(followingKey);
        setFollowingKey(null);
      }
    } else {
      lead(metronomeConfig(), index, current?.song.title);
    }
  }, [current?.song.title, followingKey, index, lead, leading, metronomeConfig, metronomeOn, publishLive, stopMetronome]);

  const changeBpm = (value: number) => {
    if (!current || followingKey) return;
    const clamped = Math.min(300, Math.max(30, Math.round(value)));
    setBpmBySong((map) => ({ ...map, [current.song.id]: clamped }));
    // A new tempo is a new grid for everybody on stage.
    if (sharedMetronome().running && leading) lead(metronomeConfig({ bpm: clamped }), index, current.song.title);
  };

  const tap = () => {
    const nowMs = performance.now();
    taps.current = [...taps.current.filter((time) => nowMs - time < 3000), nowMs].slice(-6);
    if (taps.current.length >= 3) {
      const intervals = taps.current.slice(1).map((time, position) => time - taps.current[position]);
      changeBpm(60000 / (intervals.reduce((sum, value) => sum + value, 0) / intervals.length));
    }
  };

  useEffect(() => {
    sharedMetronome().update({ sound });
  }, [sound]);

  /* ---------- Navigation ---------- */

  const goTo = useCallback((target: number) => {
    if (items.length === 0) return;
    const clamped = Math.max(0, Math.min(items.length - 1, target));
    if (clamped === index) return;
    setIndex(clamped);
    setScrolling(false);
    setSongStartedAt(Date.now());
    if (clamped > 0) setSetStartedAt((value) => value ?? Date.now());
    scrollRef.current?.scrollTo({ top: 0 });
    if (followingKey) return; // followers may look ahead – the leader's click keeps running

    const nextItem = items[clamped];
    const nextBpm = nextItem ? bpmBySong[nextItem.song.id] ?? (Number(nextItem.song.tempoBpm) || 0) : 0;
    if (autoStart && nextItem && nextBpm) {
      lead(metronomeConfig({ bpm: nextBpm, ...meterForMetronome(nextItem.song.timeSignature ?? null) }), clamped, nextItem.song.title);
    } else if (sharedMetronome().running) {
      stopMetronome();
      if (leading) {
        setLeading(false);
        publishLive(clamped, null);
      }
    } else if (leading) {
      publishLive(clamped, undefined);
    }
  }, [autoStart, bpmBySong, followingKey, index, items, lead, leading, metronomeConfig, publishLive, stopMetronome]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (["ArrowRight", "PageDown", "n"].includes(event.key)) {
        event.preventDefault();
        goTo(index + 1);
      } else if (["ArrowLeft", "PageUp", "p"].includes(event.key)) {
        event.preventDefault();
        goTo(index - 1);
      } else if (event.key === " ") {
        event.preventDefault();
        setScrolling((value) => !value);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        scrollRef.current?.scrollBy({ top: -200, behavior: "smooth" });
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        scrollRef.current?.scrollBy({ top: 200, behavior: "smooth" });
      } else if (event.key === "m") {
        toggleMetronome();
      } else if (event.key === "o") {
        setOverviewOpen((value) => !value);
      } else if (event.key === "t") {
        tap();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (!scrolling) return;
    let frame = 0;
    let last = performance.now();
    let carry = 0;
    const tick = (time: number) => {
      const element = scrollRef.current;
      if (element) {
        carry += ((time - last) / 1000) * speed * 9;
        last = time;
        const whole = Math.floor(carry);
        if (whole > 0) {
          element.scrollTop += whole;
          carry -= whole;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [scrolling, speed]);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };

  /* ---------- Derived ---------- */

  const detail = song.data?.song;
  const transpose = current ? transposeBySong[current.song.id] ?? 0 : 0;
  const setTranspose = (delta: number) => {
    if (!current) return;
    setTransposeBySong((map) => ({ ...map, [current.song.id]: (map[current.song.id] ?? 0) + delta }));
  };
  const chords = detail?.chordProText ?? "";
  const lyrics = detail?.lyricsRevisions[0]?.lyricsMarkdown ?? "";
  const scoreList = scores.data?.scores ?? [];
  const partList = parts.data?.parts ?? [];
  const activePart = partList.find((part) => part.instrument === myPart) ?? partList[0] ?? null;
  const rehearsalNote = notes.data?.notes.find((note) => note.songId === current?.song.id)?.note;
  const key = current ? transposeKey(current.customKeySignature ?? current.song.keySignature, transpose) : null;
  const durationOf = (item: (typeof items)[number] | undefined) => item?.customDurationSeconds ?? item?.song.durationSeconds ?? 0;
  const totalSeconds = items.reduce((sum, item) => sum + durationOf(item), 0);
  const remainingSeconds = items.slice(index).reduce((sum, item) => sum + durationOf(item), 0);
  const songElapsedMs = now - songStartedAt;
  const songDurationMs = durationOf(current) * 1000;
  const songProgress = songDurationMs ? Math.min(1, songElapsedMs / songDurationMs) : 0;
  const setElapsedMs = setStartedAt ? now - setStartedAt : 0;

  const availableViews = useMemo(() => {
    const list: Array<{ value: View; label: string }> = [];
    if (chords.trim()) list.push({ value: "chords", label: "Akkorde" });
    if (lyrics.trim()) list.push({ value: "lyrics", label: "Text" });
    if (scoreList.length) list.push({ value: "scores", label: "Noten" });
    if (partList.length) list.push({ value: "part", label: activePart?.instrument ?? "Stimme" });
    return list;
  }, [activePart?.instrument, chords, lyrics, partList.length, scoreList.length]);
  const effectiveView: View = availableViews.some((entry) => entry.value === view) ? view : availableViews[0]?.value ?? "chords";

  const flashClass = flashEnabled && metronomeOn && flash ? (flash === "accent" ? "ring-[6px] ring-inset ring-accent" : "ring-[3px] ring-inset ring-accent/50") : "";
  const leaderBanner = followingKey && live.remote ? `Folgt ${live.remote.leaderName}${live.accuracyMs ? ` · ±${live.accuracyMs} ms` : ""}` : leading ? "Du gibst den Takt vor – alle anderen laufen mit" : null;

  return (
    <div className={cn("theme-dark fixed inset-0 z-50 flex flex-col bg-bg text-fg transition-[box-shadow] duration-75", flashClass)}>
      {/* Top bar */}
      <header className="pt-safe shrink-0 border-b border-border bg-surface">
        <div className="flex h-14 items-center gap-1.5 px-2 sm:px-4">
          <Link href={`/app/setlists/${setlistId}`} className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg" aria-label="Live-Modus verlassen">
            <X className="size-5" />
          </Link>
          <button type="button" onClick={() => setOverviewOpen(true)} className="min-w-0 flex-1 rounded-xl px-1.5 py-1 text-left hover:bg-surface-2" aria-label="Setlist-Übersicht">
            <div className="flex items-baseline gap-2">
              <span className="shrink-0 text-sm font-semibold tabular-nums text-accent-text">{items.length ? `${index + 1}/${items.length}` : ""}</span>
              <h1 className="truncate text-lg font-semibold">{current?.song.title ?? data?.setlist.name ?? "Lädt …"}</h1>
            </div>
            <div className="flex gap-2.5 text-xs text-muted">
              {key ? <span className="font-semibold text-fg">{key}{transpose ? ` (${transpose > 0 ? "+" : ""}${transpose})` : ""}</span> : null}
              {songBpm ? <span>{songBpm} BPM</span> : null}
              {detail?.timeSignature ? <span>{detail.timeSignature}</span> : null}
              {durationOf(current) ? <span>{formatDuration(durationOf(current))}</span> : null}
            </div>
          </button>
          <div className="hidden text-right text-xs tabular-nums leading-tight text-muted sm:block">
            <div className="text-base font-semibold text-fg" suppressHydrationWarning>{new Date(now).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</div>
            <div suppressHydrationWarning>{setStartedAt ? `Set ${clock(setElapsedMs)}` : "Set nicht gestartet"}</div>
          </div>
          {leading || followingKey ? (
            <span className={cn("hidden items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold sm:inline-flex", live.connected ? "bg-success-soft text-success" : "bg-warning-soft text-warning")}>
              <Radio className="size-3" /> {leading ? "Leader" : "Folgt"}
            </span>
          ) : null}
          <IconButton onClick={() => setOverviewOpen(true)} label="Setlist-Übersicht (O)"><ListMusic /></IconButton>
          <IconButton onClick={() => setToolsOpen(true)} label="Einstellungen"><SlidersHorizontal /></IconButton>
          <IconButton onClick={toggleFullscreen} label={fullscreen ? "Vollbild beenden" : "Vollbild"} className="hidden sm:inline-flex">
            {fullscreen ? <Minimize /> : <Maximize />}
          </IconButton>
        </div>

        {/* Song + set progress */}
        <div className="relative h-1 bg-surface-2" aria-hidden>
          <div className={cn("absolute inset-y-0 left-0", songProgress >= 1 ? "bg-warning" : "bg-accent")} style={{ width: `${songProgress * 100}%` }} />
        </div>
        <div className="flex items-center justify-between gap-3 px-3 py-1 text-[11px] tabular-nums text-muted sm:px-4" suppressHydrationWarning>
          <span>Song {clock(songElapsedMs)}{songDurationMs ? ` / ${clock(songDurationMs)}` : ""}</span>
          <span>Noch {formatTotalDuration(remainingSeconds)} · gesamt {formatTotalDuration(totalSeconds)}</span>
        </div>

        {/* Metronome */}
        {metronomeBar ? (
          <div className="flex items-center gap-2 border-t border-border px-2 py-1.5 sm:px-4">
            <button
              type="button"
              onClick={toggleMetronome}
              className={cn("flex h-11 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-semibold", metronomeOn ? "bg-accent text-accent-fg" : "bg-surface-2 text-fg")}
              aria-label={metronomeOn ? "Metronom stoppen (M)" : "Metronom starten (M)"}
            >
              {metronomeOn ? <Pause className="size-4 fill-current" /> : <Timer className="size-4" />}
              <span className="hidden sm:inline">{metronomeOn ? "Stopp" : "Metronom"}</span>
            </button>
            <div className="flex flex-1 items-center justify-center gap-1.5" aria-hidden>
              {Array.from({ length: meter.beatsPerBar }).map((_, position) => {
                const active = metronomeOn && beat?.beat === position;
                return (
                  <span
                    key={position}
                    className={cn(
                      "rounded-full transition-all duration-75",
                      position === 0 ? "size-5" : "size-3.5",
                      active ? (beat?.countIn ? "bg-warning" : position === 0 ? "bg-accent" : "bg-fg") : "bg-surface-3",
                    )}
                  />
                );
              })}
              {metronomeOn && beat?.countIn ? <span className="ml-2 text-xs font-semibold text-warning">Einzähler</span> : null}
            </div>
            <div className="flex items-center rounded-xl bg-surface-2 p-0.5">
              <IconButton onClick={() => changeBpm(bpm - 1)} label="Langsamer" className="size-9"><Minus /></IconButton>
              <span className="w-14 text-center text-lg font-bold tabular-nums leading-none">{bpm}<span className="block text-[9px] font-normal text-muted">BPM</span></span>
              <IconButton onClick={() => changeBpm(bpm + 1)} label="Schneller" className="size-9"><Plus /></IconButton>
            </div>
            <IconButton onClick={tap} label="Tap Tempo (T)" className="hidden sm:inline-flex"><Hand /></IconButton>
            <IconButton onClick={() => setSound((value) => !value)} label={sound ? "Klick stumm (nur sehen/fühlen)" : "Klick an"} active={!sound}>
              {sound ? <Volume2 /> : <VolumeX />}
            </IconButton>
            {pulseActive ? <span className="hidden items-center gap-1 text-xs text-accent-text sm:inline-flex"><Vibrate className="size-4" /> Pulse</span> : null}
          </div>
        ) : null}

        {leaderBanner || live.remote?.message ? (
          <div className="flex items-center gap-2 border-t border-border bg-accent-soft px-3 py-1.5 text-sm sm:px-4">
            <Megaphone className="size-4 shrink-0 text-accent-text" />
            <span className="truncate">{[leaderBanner, live.remote?.message].filter(Boolean).join(" · ")}</span>
          </div>
        ) : null}
      </header>

      {/* Sheet */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-10"
        onTouchStart={(event) => {
          const touch = event.touches[0];
          touchRef.current = { x: touch.clientX, y: touch.clientY };
        }}
        onTouchEnd={(event) => {
          const start = touchRef.current;
          const touch = event.changedTouches[0];
          touchRef.current = null;
          if (!start) return;
          const dx = touch.clientX - start.x;
          const dy = touch.clientY - start.y;
          if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6) goTo(index + (dx < 0 ? 1 : -1));
        }}
      >
        <div className="mx-auto max-w-4xl">
          {availableViews.length > 1 ? (
            <Segmented className="mb-4" size="sm" value={effectiveView} onChange={(value) => setView(value as View)} items={availableViews} />
          ) : null}

          {showNotes && (current?.transitionNotes || rehearsalNote) ? (
            <div className="mb-5 space-y-1.5 rounded-xl border border-border bg-surface px-4 py-3 text-sm">
              {rehearsalNote ? <p><span className="font-semibold text-warning">Probe:</span> {rehearsalNote}</p> : null}
              {current?.transitionNotes ? <p><span className="font-semibold text-accent-text">Übergang:</span> {current.transitionNotes}</p> : null}
            </div>
          ) : null}

          {!current ? (
            <p className="py-20 text-center text-muted">{data ? "Diese Setlist ist leer." : "Lädt …"}</p>
          ) : song.isLoading && !detail ? (
            <p className="py-20 text-center text-muted">Lädt …</p>
          ) : effectiveView === "scores" && scoreList.length ? (
            <div className="space-y-6">
              {scoreList.map((score) => (
                <section key={score.id}>
                  <h2 className="mb-1 text-sm font-semibold text-muted">{score.title}</h2>
                  <ScoreRenderer doc={sanitizeScore(score.data)} scale={fontSize / 22} />
                </section>
              ))}
            </div>
          ) : effectiveView === "part" && activePart ? (
            <>
              {partList.length > 1 ? (
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {partList.map((part) => (
                    <button key={part.id} type="button" onClick={() => setMyPart(part.instrument)} className={cn("rounded-full border px-3 py-1 text-xs", part.id === activePart.id ? "border-accent bg-accent-soft text-accent-text" : "border-border text-muted")}>
                      {part.instrument}
                    </button>
                  ))}
                </div>
              ) : null}
              <PartView part={activePart} transpose={transpose} fontSize={fontSize} />
            </>
          ) : effectiveView === "lyrics" && lyrics.trim() ? (
            <LyricsText text={lyrics} fontSize={fontSize} />
          ) : chords.trim() ? (
            <ChordSheet text={chords} transpose={transpose} fontSize={fontSize} />
          ) : lyrics.trim() ? (
            <LyricsText text={lyrics} fontSize={fontSize} />
          ) : (
            <div className="py-16 text-center">
              <p className="text-4xl font-semibold">{current.song.title}</p>
              <p className="mt-3 text-muted">Für diesen Song gibt es noch kein Lead Sheet.</p>
            </div>
          )}

          {/* Up next (also visible at the end of the sheet) */}
          {next ? (
            <button type="button" onClick={() => goTo(index + 1)} className="mt-10 w-full rounded-2xl border border-border bg-surface p-4 text-left hover:border-accent">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">Als nächstes</span>
              <span className="mt-1 block text-2xl font-semibold">{next.song.title}</span>
              <span className="mt-1 flex flex-wrap gap-3 text-sm text-muted">
                {next.customKeySignature ?? next.song.keySignature ? <span>{transposeKey(next.customKeySignature ?? next.song.keySignature, transposeBySong[next.song.id] ?? 0)}</span> : null}
                {Number(next.song.tempoBpm) ? <span>{bpmBySong[next.song.id] ?? Number(next.song.tempoBpm)} BPM</span> : null}
                {durationOf(next) ? <span>{formatDuration(durationOf(next))}</span> : null}
              </span>
              {next.transitionNotes ? <span className="mt-2 block text-sm text-accent-text">→ {next.transitionNotes}</span> : null}
            </button>
          ) : current ? (
            <p className="mt-10 rounded-2xl border border-border bg-surface p-4 text-center text-muted">Letzter Song – gleich geschafft! 🎉</p>
          ) : null}
          <div className="h-[30vh]" aria-hidden />
        </div>
      </div>

      {/* Bottom controls */}
      <footer className="pb-safe shrink-0 border-t border-border bg-surface">
        <div className="flex items-center gap-2 px-2 py-2 sm:px-4">
          <button
            type="button"
            onClick={() => goTo(index - 1)}
            disabled={index === 0}
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-surface-2 disabled:opacity-30 sm:w-auto sm:flex-1 sm:gap-2 sm:text-sm sm:font-medium"
            aria-label="Vorheriger Song"
          >
            <ChevronLeft className="size-5" /> <span className="hidden sm:inline">Zurück</span>
          </button>
          <div className="flex items-center gap-1 rounded-xl bg-surface-2 p-1">
            <IconButton onClick={() => setSpeed((value) => Math.max(1, value - 1))} label="Langsamer scrollen" className="size-10"><Minus /></IconButton>
            <button
              type="button"
              onClick={() => setScrolling((value) => !value)}
              className={cn("flex h-11 min-w-16 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold", scrolling ? "bg-accent text-accent-fg" : "bg-surface text-fg")}
              aria-label={scrolling ? "Auto-Scroll stoppen" : "Auto-Scroll starten"}
            >
              {scrolling ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}
              {speed}
            </button>
            <IconButton onClick={() => setSpeed((value) => Math.min(12, value + 1))} label="Schneller scrollen" className="size-10"><Plus /></IconButton>
          </div>
          <button
            type="button"
            onClick={() => goTo(index + 1)}
            disabled={index >= items.length - 1}
            className="flex h-14 min-w-0 flex-1 items-center justify-between gap-2 rounded-xl bg-accent px-3 text-left text-accent-fg disabled:opacity-30"
          >
            <span className="min-w-0">
              <span className="block text-[10px] font-semibold uppercase tracking-wider opacity-80">{next ? "Nächster" : "Ende"}</span>
              <span className="block truncate text-sm font-semibold">{next ? next.song.title : "Set beendet"}</span>
              {afterNext ? <span className="hidden truncate text-[11px] opacity-75 md:block">danach: {afterNext.song.title}</span> : null}
            </span>
            <ChevronRight className="size-5 shrink-0" />
          </button>
        </div>
      </footer>

      {/* Setlist overview */}
      <Dialog open={overviewOpen} onClose={() => setOverviewOpen(false)} title={data?.setlist.name ?? "Setlist"} size="md">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
            <span>{items.length} Songs · {formatTotalDuration(totalSeconds)}</span>
            {setStartedAt ? (
              <button type="button" className="text-xs hover:text-fg" onClick={() => setSetStartedAt(null)}>Set-Uhr zurücksetzen ({clock(setElapsedMs)})</button>
            ) : (
              <button type="button" className="text-xs font-medium text-accent-text" onClick={() => setSetStartedAt(Date.now())}>Set-Uhr starten</button>
            )}
          </div>
          <ol className="max-h-[50vh] space-y-0.5 overflow-y-auto">
            {items.map((item, position) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    goTo(position);
                    setOverviewOpen(false);
                  }}
                  className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left", position === index ? "bg-accent-soft" : "hover:bg-surface-2")}
                >
                  <span className="w-6 text-right text-sm tabular-nums text-subtle">{position < index ? <Check className="ml-auto size-4 text-success" /> : position + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate font-medium", position < index && "text-muted")}>{item.song.title}</span>
                    {item.transitionNotes ? <span className="block truncate text-xs text-accent-text">→ {item.transitionNotes}</span> : null}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted">
                    {[item.customKeySignature ?? item.song.keySignature, Number(item.song.tempoBpm) ? `${Number(item.song.tempoBpm)}` : null, durationOf(item) ? formatDuration(durationOf(item)) : null].filter(Boolean).join(" · ")}
                  </span>
                </button>
              </li>
            ))}
          </ol>

          <div className="space-y-2 rounded-xl border border-border p-3">
            <div className="flex items-center gap-2 text-sm font-medium"><Radio className="size-4" /> Bühnen-Sync</div>
            <p className="text-xs text-muted">
              Wer Start drückt, gibt den Takt vor – alle anderen Geräte im Live-Modus laufen automatisch mit (Click, Vibration, Songwechsel).
              Im Browser über den Bandival-Server (z. B. im Proberaum-WLAN); die Android-App synchronisiert zusätzlich offline per Bluetooth – ganz ohne Internet.
            </p>
            <p className="text-xs text-muted">
              {live.connected ? "Server verbunden" : "Server nicht erreichbar – Click läuft lokal"} · {live.presence.length} im Live-Modus{live.presence.length ? `: ${live.presence.map((person) => person.displayName).join(", ")}` : ""}
              {offlineReady ? " · Setlist offline gespeichert" : ""}
            </p>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={autoFollow} onChange={(event) => { setAutoFollow(event.target.checked); if (event.target.checked) setIgnoredKey(null); }} /> Automatisch mitlaufen</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={followSongs} onChange={(event) => setFollowSongs(event.target.checked)} /> Songwechsel mitmachen</label>
            {leading ? (
              <form className="flex gap-2" onSubmit={(event) => {
                event.preventDefault();
                publishLive(index, undefined, announcement.trim() || null);
                setAnnouncement("");
              }}>
                <input value={announcement} onChange={(event) => setAnnouncement(event.target.value)} placeholder="Ansage an alle, z. B. „Zugabe: Song 12“" className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 text-sm" maxLength={140} />
                <button type="submit" className="rounded-lg bg-accent px-3 text-sm font-medium text-accent-fg">Senden</button>
              </form>
            ) : null}
          </div>
        </div>
      </Dialog>

      {/* Tools */}
      <Dialog open={toolsOpen} onClose={() => setToolsOpen(false)} title="Live-Einstellungen" size="md">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-xl bg-surface-2 p-0.5">
              <IconButton onClick={() => setTranspose(-1)} label="Halbton tiefer"><ChevronDown /></IconButton>
              <span className="w-20 text-center text-xs font-medium">Transp. {transpose > 0 ? `+${transpose}` : transpose}</span>
              <IconButton onClick={() => setTranspose(1)} label="Halbton höher"><ChevronUp /></IconButton>
            </div>
            <div className="flex items-center rounded-xl bg-surface-2 p-0.5">
              <IconButton onClick={() => setFontSize((value) => Math.max(14, value - 2))} label="Schrift kleiner"><Minus /></IconButton>
              <span className="w-16 text-center text-xs font-medium">{fontSize}px</span>
              <IconButton onClick={() => setFontSize((value) => Math.min(48, value + 2))} label="Schrift größer"><Plus /></IconButton>
            </div>
            <IconButton onClick={() => setShowNotes((value) => !value)} label="Notizen anzeigen" active={showNotes}><MessageSquareText /></IconButton>
          </div>

          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-semibold">Metronom</legend>
            {[
              { label: "Metronom-Leiste anzeigen", value: metronomeBar, set: setMetronomeBar },
              { label: "Einzähler (1 Takt)", value: countIn, set: setCountIn },
              { label: "Bei Songwechsel automatisch im neuen Tempo starten", value: autoStart, set: setAutoStart },
              { label: "Beat-Blitz am Bildschirmrand", value: flashEnabled, set: setFlashEnabled },
              { label: "Klick hörbar (aus = nur sehen/fühlen)", value: sound, set: setSound },
            ].map((option) => (
              <label key={option.label} className="flex items-center gap-2.5 text-sm">
                <input type="checkbox" checked={option.value} onChange={(event) => option.set(event.target.checked)} className="size-4" />
                {option.label}
              </label>
            ))}
            <label className="block text-sm">
              <span className="flex justify-between"><span>Latenz-Ausgleich (Bluetooth-Kopfhörer, Funk-In-Ears)</span><span className="text-muted">{outputDelay} ms</span></span>
              <input type="range" min={0} max={300} step={5} value={outputDelay} onChange={(event) => setOutputDelay(Number(event.target.value))} className="w-full accent-[var(--accent)]" />
            </label>
            <p className="flex items-center gap-1.5 text-xs text-muted"><Zap className="size-3.5" /> Tastatur: M Metronom · T Tap-Tempo · O Übersicht · Leertaste Auto-Scroll · ←/→ Song</p>
          </fieldset>

          <fieldset>
            <legend className="mb-2 flex items-center gap-2 text-sm font-semibold"><Vibrate className="size-4" /> Fühlbares Metronom (Bandival Pulse)</legend>
            <PulsePanel />
          </fieldset>
        </div>
      </Dialog>
    </div>
  );
}
