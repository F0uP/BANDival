"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, Repeat, RotateCcw, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/client/cn";
import type { AudioVersion } from "@/lib/client/types";
import { Button } from "@/components/ui/button";
import { usePlayer } from "@/components/providers/player";
import { t, translatable } from "@/lib/i18n";

/**
 * Practice mixer for a finished stereo recording – no AI, pure signal processing (Web Audio):
 *  - "Gesang/Mitte": mid channel above 200 Hz (lead vocals are usually panned centre)
 *  - "Seiten": stereo side signal (double-tracked guitars, keys, room)
 *  - "Bass & Kick": low shelf, "Höhen": high shelf
 * It cannot separate instruments perfectly – results depend on the mix – but it is great for playing along.
 */

type Mix = { vocals: number; sides: number; bass: number; highs: number };
const ORIGINAL: Mix = { vocals: 1, sides: 1, bass: 0, highs: 0 };

const PRESETS: Array<{ label: string; mix: Mix; hint: string }> = translatable([
  { label: "Original", mix: ORIGINAL, hint: "Unverändert" },
  { label: "Ohne Gesang", mix: { vocals: 0, sides: 1, bass: 0, highs: 0 }, hint: "Mitte über 200 Hz entfernt – zum Mitsingen" },
  { label: "Ohne Bass", mix: { vocals: 1, sides: 1, bass: -30, highs: 0 }, hint: "Tiefen abgesenkt – für Bassist:innen" },
  { label: "Bass hören", mix: { vocals: 0.5, sides: 0.4, bass: 6, highs: -12 }, hint: "Bass & Kick hervorheben" },
  { label: "Nur Mitte", mix: { vocals: 1, sides: 0, bass: 0, highs: 0 }, hint: "Seiten aus – Gesang, Bass, Snare" },
  { label: "Ohne Mitte", mix: { vocals: 0, sides: 1.3, bass: -12, highs: 0 }, hint: "Nur Stereobild – Gitarren & Keys" },
]);

type Graph = {
  ctx: AudioContext;
  vocal: GainNode;
  sideL: GainNode;
  sideR: GainNode;
  lowShelf: BiquadFilterNode;
  highShelf: BiquadFilterNode;
};

function buildGraph(element: HTMLAudioElement): Graph {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctor();
  const source = ctx.createMediaElementSource(element);
  const splitter = ctx.createChannelSplitter(2);
  source.connect(splitter);

  // mid = (L + R) / 2
  const mid = ctx.createGain();
  const midL = ctx.createGain();
  const midR = ctx.createGain();
  midL.gain.value = 0.5;
  midR.gain.value = 0.5;
  splitter.connect(midL, 0);
  splitter.connect(midR, 1);
  midL.connect(mid);
  midR.connect(mid);

  // side = (L - R) / 2
  const side = ctx.createGain();
  const sideFromL = ctx.createGain();
  const sideFromR = ctx.createGain();
  sideFromL.gain.value = 0.5;
  sideFromR.gain.value = -0.5;
  splitter.connect(sideFromL, 0);
  splitter.connect(sideFromR, 1);
  sideFromL.connect(side);
  sideFromR.connect(side);

  // Split the mid channel: lows stay (bass & kick), everything above 200 Hz is the "vocal" control.
  const midLow = ctx.createBiquadFilter();
  midLow.type = "lowpass";
  midLow.frequency.value = 200;
  const midHigh = ctx.createBiquadFilter();
  midHigh.type = "highpass";
  midHigh.frequency.value = 200;
  const vocal = ctx.createGain();
  mid.connect(midLow);
  mid.connect(midHigh).connect(vocal);

  const sideL = ctx.createGain();
  const sideR = ctx.createGain();
  side.connect(sideL);
  side.connect(sideR);

  // Re-matrix: L = mid + side, R = mid - side
  const outL = ctx.createGain();
  const outR = ctx.createGain();
  midLow.connect(outL);
  midLow.connect(outR);
  vocal.connect(outL);
  vocal.connect(outR);
  sideL.connect(outL);
  sideR.connect(outR);

  const merger = ctx.createChannelMerger(2);
  outL.connect(merger, 0, 0);
  outR.connect(merger, 0, 1);

  const lowShelf = ctx.createBiquadFilter();
  lowShelf.type = "lowshelf";
  lowShelf.frequency.value = 180;
  const highShelf = ctx.createBiquadFilter();
  highShelf.type = "highshelf";
  highShelf.frequency.value = 6000;
  merger.connect(lowShelf).connect(highShelf).connect(ctx.destination);

  return { ctx, vocal, sideL, sideR, lowShelf, highShelf };
}

function clock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

function Slider({ label, hint, value, min, max, step, format, onChange }: {
  label: string; hint: string; value: number; min: number; max: number; step: number; format: (value: number) => string; onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-xs tabular-nums text-muted">{format(value)}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="w-full accent-[var(--accent)]" aria-label={label} />
      <span className="block text-[11px] text-subtle">{hint}</span>
    </label>
  );
}

export function PracticeMixer({ audio }: { audio: AudioVersion }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const graphRef = useRef<Graph | null>(null);
  const globalPlayer = usePlayer();
  const [mix, setMix] = useState<Mix>(ORIGINAL);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(audio.durationSeconds ?? 0);
  const [rate, setRate] = useState(1);
  const [loop, setLoop] = useState<{ a: number | null; b: number | null }>({ a: null, b: null });

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const now = graph.ctx.currentTime;
    graph.vocal.gain.setTargetAtTime(mix.vocals, now, 0.03);
    graph.sideL.gain.setTargetAtTime(mix.sides, now, 0.03);
    graph.sideR.gain.setTargetAtTime(-mix.sides, now, 0.03);
    graph.lowShelf.gain.setTargetAtTime(mix.bass, now, 0.03);
    graph.highShelf.gain.setTargetAtTime(mix.highs, now, 0.03);
  }, [mix, playing]);

  useEffect(() => {
    const element = audioRef.current;
    if (!element) return;
    element.playbackRate = rate;
    (element as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
  }, [rate]);

  useEffect(() => () => {
    audioRef.current?.pause();
    void graphRef.current?.ctx.close();
  }, []);

  const toggle = async () => {
    const element = audioRef.current;
    if (!element) return;
    if (playing) {
      element.pause();
      return;
    }
    if (globalPlayer.playing) globalPlayer.toggle();
    graphRef.current ??= buildGraph(element);
    await graphRef.current.ctx.resume();
    await element.play();
  };

  return (
    <div className="space-y-4 rounded-xl border border-border p-3.5">
      <div className="flex items-center gap-2 text-sm font-medium">
        <SlidersHorizontal className="size-4 text-accent-text" /> {t("Übungsmixer")}
        <span className="text-xs font-normal text-muted">{t("– läuft komplett im Browser, ohne KI")}</span>
      </div>
      <audio
        ref={audioRef}
        src={audio.fileUrl}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
        onTimeUpdate={(event) => {
          const now = event.currentTarget.currentTime;
          setPosition(now);
          if (loop.a !== null && loop.b !== null && now >= loop.b) event.currentTarget.currentTime = loop.a;
        }}
      />

      <div className="flex items-center gap-3">
        <Button size="icon" variant="primary" onClick={() => void toggle()} aria-label={playing ? t("Pause") : t("Abspielen")}>
          {playing ? <Pause className="fill-current" /> : <Play className="fill-current" />}
        </Button>
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.1}
          value={position}
          onChange={(event) => {
            if (audioRef.current) audioRef.current.currentTime = Number(event.target.value);
            setPosition(Number(event.target.value));
          }}
          className="flex-1 accent-[var(--accent)]"
          aria-label={t("Position")}
        />
        <span className="w-24 text-right text-xs tabular-nums text-muted">{clock(position)} / {clock(duration)}</span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => {
          const active = JSON.stringify(preset.mix) === JSON.stringify(mix);
          return (
            <button
              key={preset.label}
              type="button"
              title={preset.hint}
              onClick={() => setMix(preset.mix)}
              className={cn("rounded-full border px-3 py-1 text-xs font-medium", active ? "border-accent bg-accent-soft text-accent-text" : "border-border text-muted hover:text-fg")}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Slider label={t("Gesang / Mitte")} hint={t("Mittig gemischte Signale über 200 Hz")} value={mix.vocals} min={0} max={1.5} step={0.05} format={(value) => `${Math.round(value * 100)} %`} onChange={(vocals) => setMix((current) => ({ ...current, vocals }))} />
        <Slider label={t("Stereo-Seiten")} hint={t("Links/rechts gemischte Gitarren, Keys, Raum")} value={mix.sides} min={0} max={1.5} step={0.05} format={(value) => `${Math.round(value * 100)} %`} onChange={(sides) => setMix((current) => ({ ...current, sides }))} />
        <Slider label={t("Bass & Kick")} hint={t("Tiefen unter ~180 Hz")} value={mix.bass} min={-30} max={9} step={1} format={(value) => `${value > 0 ? "+" : ""}${value} dB`} onChange={(bass) => setMix((current) => ({ ...current, bass }))} />
        <Slider label={t("Höhen")} hint={t("Becken, Hi-Hat, Zischlaute")} value={mix.highs} min={-30} max={9} step={1} format={(value) => `${value > 0 ? "+" : ""}${value} dB`} onChange={(highs) => setMix((current) => ({ ...current, highs }))} />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted">{t("Tempo")}</span>
        {[0.5, 0.75, 0.9, 1].map((value) => (
          <Button key={value} size="sm" variant={rate === value ? "secondary" : "ghost"} onClick={() => setRate(value)}>{Math.round(value * 100)} %</Button>
        ))}
        <span className="mx-1 h-5 w-px bg-border" />
        <Repeat className="size-3.5 text-muted" />
        <Button size="sm" variant={loop.a !== null ? "secondary" : "ghost"} onClick={() => setLoop((current) => ({ ...current, a: position }))}>{t("A")} {loop.a !== null ? clock(loop.a) : ""}</Button>
        <Button size="sm" variant={loop.b !== null ? "secondary" : "ghost"} onClick={() => setLoop((current) => ({ ...current, b: current.a !== null && position > current.a ? position : null }))}>{t("B")} {loop.b !== null ? clock(loop.b) : ""}</Button>
        {loop.a !== null || loop.b !== null ? <Button size="sm" variant="ghost" onClick={() => setLoop({ a: null, b: null })}>{t("Loop aus")}</Button> : null}
        <Button size="sm" variant="ghost" icon={<RotateCcw />} className="ml-auto" onClick={() => { setMix(ORIGINAL); setRate(1); }}>{t("Zurücksetzen")}</Button>
      </div>
      <p className="text-[11px] text-subtle">
        {t("Hinweis: Das ist keine KI-Trennung – wie gut z. B. „Ohne Gesang“ klappt, hängt davon ab, wie der Song gemischt ist. Bei Mono-Aufnahmen wirken nur Bass und Höhen. Perfekte Kontrolle über einzelne Instrumente gibt es mit Einzelspuren (Stems) weiter unten.")}
      </p>
    </div>
  );
}
