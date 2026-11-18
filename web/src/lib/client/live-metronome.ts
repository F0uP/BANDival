"use client";

import { audioContext, scheduleClick } from "@/lib/notation/player";

export type MetronomeConfig = {
  bpm: number;
  beatsPerBar: number;
  beatUnit: number;
  subdivision: 1 | 2 | 3 | 4;
  sound: boolean;
  volume: number;
  countInBars: number;
};

export type BeatInfo = {
  /** 0-based beat within the bar. */
  beat: number;
  bar: number;
  countIn: boolean;
  accent: boolean;
  subdivision: boolean;
  /** Wall-clock time of the beat (ms since epoch). */
  epochMs: number;
};

export type MetronomeListener = (info: BeatInfo) => void;

/** Parses a time signature for the metronome. Compound meters (6/8, 9/8, 12/8) click dotted quarters with triplet feel. */
export function meterForMetronome(timeSignature: string | null | undefined): { beatsPerBar: number; beatUnit: number; subdivision: 1 | 3 } {
  const match = /^(\d{1,2})\/(\d{1,2})$/.exec(timeSignature?.trim() ?? "");
  const numerator = match ? Number(match[1]) : 4;
  const denominator = match ? Number(match[2]) : 4;
  if (denominator === 8 && numerator % 3 === 0 && numerator > 3) {
    return { beatsPerBar: numerator / 3, beatUnit: 8, subdivision: 3 };
  }
  return { beatsPerBar: Math.max(1, numerator), beatUnit: denominator, subdivision: 1 };
}

/**
 * Look-ahead metronome on the Web Audio clock. Listeners are notified at the moment a beat sounds
 * (visual flash, phone vibration, Bandival Pulse stream mode).
 */
export class LiveMetronome {
  private config: MetronomeConfig | null = null;
  private interval = 0;
  private timeouts = new Set<number>();
  private nextBeatTime = 0;
  private beatCounter = 0;
  private countInBeats = 0;
  private initialCounter = 0;
  private ctxAtStart = 0;
  private epochAtStart = 0;
  private listeners = new Set<MetronomeListener>();
  private gain: GainNode | null = null;
  /** Extra delay of the listening path (Bluetooth headphones, wireless in-ears) – set by the user. */
  outputDelayMs = 0;

  get running(): boolean {
    return this.config !== null;
  }

  get currentConfig(): MetronomeConfig | null {
    return this.config;
  }

  subscribe(listener: MetronomeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Wall-clock time of the very first beat of the grid (including count-in) – shared via live sync. */
  get gridStartEpochMs(): number {
    return this.epochAtStart - (this.initialCounter * 60_000) / (this.config?.bpm ?? 120);
  }

  /**
   * Starts the metronome. With `alignToEpochMs` (e.g. from the live-sync leader) the beat grid is aligned
   * to that wall-clock time so several devices click together.
   */
  start(config: MetronomeConfig, alignToEpochMs?: number): void {
    this.stop();
    const ctx = audioContext();
    void ctx.resume();
    this.gain = ctx.createGain();
    this.gain.gain.value = config.volume;
    this.gain.connect(ctx.destination);
    this.config = config;
    this.beatCounter = 0;
    this.countInBeats = config.countInBars * config.beatsPerBar;

    const secondsPerBeat = 60 / config.bpm;
    // Time between scheduling on the audio clock and hearing it (browser output latency + manual offset).
    const latency = (ctx.outputLatency || ctx.baseLatency || 0) + this.outputDelayMs / 1000;
    let firstBeat = ctx.currentTime + 0.1;
    if (alignToEpochMs) {
      const deltaSeconds = (alignToEpochMs - Date.now()) / 1000 - latency;
      if (deltaSeconds > 0.05) {
        firstBeat = ctx.currentTime + deltaSeconds;
      } else {
        // Join a running grid: skip to the next beat and keep the bar position.
        const elapsedBeats = Math.ceil(-deltaSeconds / secondsPerBeat + 0.05);
        firstBeat = ctx.currentTime + deltaSeconds + elapsedBeats * secondsPerBeat;
        this.beatCounter = elapsedBeats;
      }
    }
    this.initialCounter = this.beatCounter;
    this.nextBeatTime = firstBeat;
    // Wall-clock time at which the first scheduled beat is actually heard.
    this.epochAtStart = Date.now() + (firstBeat - ctx.currentTime + latency) * 1000;
    this.ctxAtStart = firstBeat;
    this.latencySeconds = latency;

    const schedule = () => {
      const current = this.config;
      if (!current) return;
      const spb = 60 / current.bpm;
      while (this.nextBeatTime < ctx.currentTime + 0.15) {
        const isCountIn = this.beatCounter < this.countInBeats;
        const beatInBar = this.beatCounter % current.beatsPerBar;
        const bar = Math.floor((this.beatCounter - this.countInBeats) / current.beatsPerBar);
        const accent = beatInBar === 0;
        if (current.sound && this.gain) {
          scheduleClick(ctx, this.gain, this.nextBeatTime, accent, isCountIn ? 1 : accent ? 1 : 0.75);
          for (let sub = 1; sub < current.subdivision && !isCountIn; sub += 1) {
            scheduleClick(ctx, this.gain, this.nextBeatTime + (spb * sub) / current.subdivision, false, 0.25);
          }
        }
        this.notify({ beat: beatInBar, bar, countIn: isCountIn, accent, subdivision: false, epochMs: this.epochAt(this.nextBeatTime) }, this.nextBeatTime - ctx.currentTime + this.latencySeconds);
        this.nextBeatTime += spb;
        this.beatCounter += 1;
      }
    };
    schedule();
    this.interval = window.setInterval(schedule, 25);
  }

  private epochAt(ctxTime: number): number {
    return this.epochAtStart + (ctxTime - this.ctxAtStart) * 1000;
  }

  private latencySeconds = 0;

  /** Smoothly moves the running grid to a new start time (follower fine-tuning without restart). */
  align(gridStartEpochMs: number): void {
    if (!this.config) return;
    const ctx = audioContext();
    const secondsPerBeat = 60 / this.config.bpm;
    // Audio-clock time at which beat #beatCounter must be scheduled to be heard on the new grid.
    let target = ctx.currentTime + (gridStartEpochMs + (this.beatCounter * secondsPerBeat * 1000) - Date.now()) / 1000 - this.latencySeconds;
    while (target < ctx.currentTime + 0.03) {
      target += secondsPerBeat;
      this.beatCounter += 1;
    }
    this.nextBeatTime = target;
    this.ctxAtStart = target;
    this.epochAtStart = Date.now() + (target - ctx.currentTime + this.latencySeconds) * 1000;
    this.initialCounter = this.beatCounter;
  }

  private notify(info: BeatInfo, delaySeconds: number) {
    const id = window.setTimeout(() => {
      this.timeouts.delete(id);
      this.listeners.forEach((listener) => listener(info));
    }, Math.max(0, delaySeconds * 1000));
    this.timeouts.add(id);
  }

  /** Changes tempo/volume on the fly (applies from the next beat). */
  update(patch: Partial<MetronomeConfig>): void {
    if (!this.config) return;
    this.config = { ...this.config, ...patch };
    if (patch.volume !== undefined && this.gain) this.gain.gain.value = patch.volume;
  }

  stop(): void {
    window.clearInterval(this.interval);
    this.timeouts.forEach((id) => window.clearTimeout(id));
    this.timeouts.clear();
    this.gain?.disconnect();
    this.gain = null;
    this.config = null;
  }
}

/** One shared engine per page – the stage mode, Pulse devices and live sync all use it. */
let shared: LiveMetronome | null = null;
export function sharedMetronome(): LiveMetronome {
  shared ??= new LiveMetronome();
  return shared;
}
