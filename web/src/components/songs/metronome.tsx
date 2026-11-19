"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Pause, Play, Plus } from "lucide-react";
import { cn } from "@/lib/client/cn";
import { t } from "@/lib/i18n";

/** Sample-accurate metronome using the Web Audio API look-ahead scheduler. */
export function Metronome({ initialBpm, compact = false, beatsPerBar = 4 }: { initialBpm?: number | null; compact?: boolean; beatsPerBar?: number }) {
  const [bpm, setBpm] = useState(() => Math.min(300, Math.max(30, Math.round(initialBpm || 100))));
  const [running, setRunning] = useState(false);
  const [beat, setBeat] = useState(-1);
  const contextRef = useRef<AudioContext | null>(null);
  const bpmRef = useRef(bpm);

  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);

  useEffect(() => {
    if (!running) return;
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const context = contextRef.current ?? new AudioCtx();
    contextRef.current = context;
    void context.resume();

    let nextTime = context.currentTime + 0.05;
    let count = 0;
    const timeouts: number[] = [];

    const schedule = () => {
      while (nextTime < context.currentTime + 0.12) {
        const accent = count % beatsPerBar === 0;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.value = accent ? 1600 : 1000;
        gain.gain.setValueAtTime(0.0001, nextTime);
        gain.gain.exponentialRampToValueAtTime(accent ? 0.6 : 0.35, nextTime + 0.002);
        gain.gain.exponentialRampToValueAtTime(0.0001, nextTime + 0.05);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(nextTime);
        oscillator.stop(nextTime + 0.06);

        const visualBeat = count % beatsPerBar;
        timeouts.push(window.setTimeout(() => setBeat(visualBeat), Math.max(0, (nextTime - context.currentTime) * 1000)));
        nextTime += 60 / bpmRef.current;
        count += 1;
      }
    };

    const interval = window.setInterval(schedule, 25);
    schedule();
    return () => {
      window.clearInterval(interval);
      timeouts.forEach((id) => window.clearTimeout(id));
      setBeat(-1);
    };
  }, [running, beatsPerBar]);

  useEffect(() => () => {
    void contextRef.current?.close();
  }, []);

  const change = (delta: number) => setBpm((current) => Math.min(300, Math.max(30, current + delta)));

  return (
    <div className={cn("inline-flex items-center gap-2 rounded-xl border border-border bg-surface", compact ? "p-1" : "p-1.5")}>
      <button
        type="button"
        onClick={() => setRunning((current) => !current)}
        className={cn("flex size-8 items-center justify-center rounded-lg transition-colors", running ? "bg-accent text-accent-fg" : "bg-surface-2 text-fg hover:bg-surface-3")}
        aria-label={running ? t("Metronom stoppen") : t("Metronom starten")}
      >
        {running ? <Pause className="size-3.5 fill-current" /> : <Play className="ml-0.5 size-3.5 fill-current" />}
      </button>
      <div className="flex items-center gap-1" aria-hidden>
        {Array.from({ length: beatsPerBar }).map((_, index) => (
          <span
            key={index}
            className={cn(
              "size-2 rounded-full transition-colors duration-75",
              beat === index ? (index === 0 ? "bg-accent" : "bg-fg") : "bg-surface-3",
            )}
          />
        ))}
      </div>
      <button type="button" onClick={() => change(-1)} className="flex size-7 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg" aria-label={t("Langsamer")}>
        <Minus className="size-3.5" />
      </button>
      <span className="w-14 text-center text-sm font-semibold tabular-nums">{bpm}<span className="ml-0.5 text-[10px] font-normal text-muted">{t("BPM")}</span></span>
      <button type="button" onClick={() => change(1)} className="flex size-7 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg" aria-label={t("Schneller")}>
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}
