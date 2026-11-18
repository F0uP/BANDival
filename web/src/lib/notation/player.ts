"use client";

import { INSTRUMENTS, parseMeter, playbackNotes, type DrumSound, type ScoreDoc } from "@/lib/notation/model";

type PlayOptions = {
  fromTick?: number;
  metronome?: boolean;
  countIn?: boolean;
  speed?: number;
  onPosition?: (eventIndex: number | null) => void;
  onEnd?: () => void;
};

let sharedContext: AudioContext | null = null;

export function audioContext(): AudioContext {
  if (!sharedContext) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedContext = new Ctor({ latencyHint: "interactive" });
  }
  return sharedContext;
}

function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

let noiseBuffer: AudioBuffer | null = null;
function noise(ctx: AudioContext): AudioBuffer {
  if (!noiseBuffer || noiseBuffer.sampleRate !== ctx.sampleRate) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

/** Short synthesized click used by metronomes (accent = higher pitch). */
export function scheduleClick(ctx: AudioContext, destination: AudioNode, time: number, accent: boolean, volume = 1): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = accent ? 1760 : 1175;
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(0.6 * volume, time + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.06);
  osc.connect(gain).connect(destination);
  osc.start(time);
  osc.stop(time + 0.08);
}

function playTone(ctx: AudioContext, out: AudioNode, synth: string, midi: number, time: number, duration: number, velocity: number) {
  const freq = midiToHz(midi);
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  const peak = 0.22 * velocity;
  const end = time + duration;
  const osc = ctx.createOscillator();
  const osc2 = ctx.createOscillator();

  if (synth === "pluck" || synth === "bass") {
    osc.type = "sawtooth";
    osc2.type = "triangle";
    filter.frequency.setValueAtTime(synth === "bass" ? 1400 : 3800, time);
    filter.frequency.exponentialRampToValueAtTime(synth === "bass" ? 260 : 700, time + Math.min(1.2, duration + 0.2));
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(peak * (synth === "bass" ? 1.4 : 1), time + 0.005);
    gain.gain.exponentialRampToValueAtTime(peak * 0.25, time + Math.min(0.6, duration));
    gain.gain.exponentialRampToValueAtTime(0.0001, end + 0.12);
  } else if (synth === "keys") {
    osc.type = "triangle";
    osc2.type = "sine";
    filter.frequency.value = 5000;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(peak, time + 0.008);
    gain.gain.exponentialRampToValueAtTime(peak * 0.35, time + Math.min(0.8, duration));
    gain.gain.exponentialRampToValueAtTime(0.0001, end + 0.25);
  } else {
    // lead / voice: soft attack, sustained
    osc.type = synth === "voice" ? "sine" : "sawtooth";
    osc2.type = "triangle";
    filter.frequency.value = synth === "voice" ? 2200 : 2600;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(peak * 0.8, time + 0.05);
    gain.gain.setValueAtTime(peak * 0.7, Math.max(time + 0.05, end - 0.05));
    gain.gain.exponentialRampToValueAtTime(0.0001, end + 0.08);
  }

  osc.frequency.value = freq;
  osc2.frequency.value = freq * (synth === "bass" ? 0.5 : 1.003);
  osc.connect(filter);
  osc2.connect(filter);
  filter.connect(gain).connect(out);
  osc.start(time);
  osc2.start(time);
  osc.stop(end + 0.4);
  osc2.stop(end + 0.4);
}

function playDrum(ctx: AudioContext, out: AudioNode, drum: DrumSound, time: number, velocity: number) {
  const gain = ctx.createGain();
  gain.connect(out);
  if (drum === "kick") {
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(140, time);
    osc.frequency.exponentialRampToValueAtTime(45, time + 0.12);
    gain.gain.setValueAtTime(0.9 * velocity, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.35);
    osc.connect(gain);
    osc.start(time);
    osc.stop(time + 0.4);
    return;
  }
  if (drum.startsWith("tom")) {
    const base = drum === "tom-high" ? 220 : drum === "tom-mid" ? 165 : 110;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(base, time);
    osc.frequency.exponentialRampToValueAtTime(base * 0.6, time + 0.25);
    gain.gain.setValueAtTime(0.6 * velocity, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.4);
    osc.connect(gain);
    osc.start(time);
    osc.stop(time + 0.45);
    return;
  }
  const source = ctx.createBufferSource();
  source.buffer = noise(ctx);
  const filter = ctx.createBiquadFilter();
  let length = 0.05;
  if (drum === "snare" || drum === "rimshot") {
    filter.type = "bandpass";
    filter.frequency.value = drum === "rimshot" ? 2500 : 1800;
    length = drum === "rimshot" ? 0.08 : 0.2;
    const body = ctx.createOscillator();
    const bodyGain = ctx.createGain();
    body.frequency.setValueAtTime(drum === "rimshot" ? 400 : 190, time);
    bodyGain.gain.setValueAtTime(0.35 * velocity, time);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.1);
    body.connect(bodyGain).connect(out);
    body.start(time);
    body.stop(time + 0.12);
  } else {
    filter.type = "highpass";
    filter.frequency.value = drum === "ride" ? 5000 : 7000;
    length = drum === "crash" ? 1.4 : drum === "ride" ? 0.7 : drum === "hihat-open" ? 0.35 : drum === "hihat-pedal" ? 0.04 : 0.06;
  }
  const level = drum === "crash" ? 0.35 : drum === "ride" ? 0.18 : drum.startsWith("hihat") ? 0.2 : 0.55;
  gain.gain.setValueAtTime(level * velocity, time);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + length);
  source.connect(filter).connect(gain);
  source.start(time);
  source.stop(time + length + 0.05);
}

/** Plays a score with simple built-in synthesizers (no sample downloads needed). */
export class ScorePlayer {
  private master: GainNode | null = null;
  private raf = 0;
  private stopTimer = 0;

  get playing(): boolean {
    return this.master !== null;
  }

  play(doc: ScoreDoc, options: PlayOptions = {}): void {
    this.stop();
    const ctx = audioContext();
    void ctx.resume();
    const master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    this.master = master;

    const speed = options.speed ?? 1;
    const secondsPerTick = 60 / (doc.tempo * speed) / 480;
    const { beatTicks, measureTicks } = parseMeter(doc.meter);
    const fromTick = options.fromTick ?? 0;
    const countInTicks = options.countIn ? measureTicks : 0;
    const startAt = ctx.currentTime + 0.12;
    const synth = INSTRUMENTS[doc.instrument].synth;
    const notes = playbackNotes(doc).filter((note) => note.startTick + note.ticks > fromTick);
    const endTick = notes.length ? Math.max(...notes.map((note) => note.startTick + note.ticks)) : fromTick;

    const timeOf = (tick: number) => startAt + (tick - fromTick + countInTicks) * secondsPerTick;

    if (options.countIn) {
      for (let tick = 0; tick < countInTicks; tick += beatTicks) {
        scheduleClick(ctx, master, startAt + tick * secondsPerTick, tick === 0);
      }
    }
    if (options.metronome) {
      const firstBeat = Math.ceil(fromTick / beatTicks) * beatTicks;
      for (let tick = firstBeat; tick < endTick; tick += beatTicks) {
        scheduleClick(ctx, master, timeOf(tick), tick % measureTicks === 0, 0.6);
      }
    }

    for (const note of notes) {
      if (note.startTick < fromTick) continue;
      const time = timeOf(note.startTick);
      const duration = (note.staccato ? note.ticks / 2 : note.ticks) * secondsPerTick;
      const velocity = note.accent ? 1.25 : 1;
      if (synth === "drums") {
        note.drums.forEach((drum) => playDrum(ctx, master, drum, time, velocity));
      } else {
        note.midi.forEach((midi) => playTone(ctx, master, synth, midi, time, Math.max(0.06, duration * 0.95), velocity));
      }
    }

    const totalSeconds = (endTick - fromTick + countInTicks) * secondsPerTick;
    const tick = () => {
      if (!this.master) return;
      const elapsedTicks = (ctx.currentTime - startAt) / secondsPerTick - countInTicks + fromTick;
      let current: (typeof notes)[number] | null = null;
      for (const note of notes) {
        if (note.startTick > elapsedTicks) break;
        current = note;
      }
      options.onPosition?.(elapsedTicks < fromTick ? null : current ? current.eventIndex : null);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
    this.stopTimer = window.setTimeout(() => {
      this.stop();
      options.onEnd?.();
    }, (totalSeconds + 0.4) * 1000);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    window.clearTimeout(this.stopTimer);
    if (this.master) {
      const ctx = audioContext();
      const master = this.master;
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
      setTimeout(() => master.disconnect(), 200);
      this.master = null;
    }
  }

  /** Plays a single event immediately (feedback while typing notes). */
  static preview(doc: ScoreDoc, eventIndex: number): void {
    const event = doc.events[eventIndex];
    if (!event) return;
    const ctx = audioContext();
    void ctx.resume();
    const now = ctx.currentTime + 0.01;
    const info = INSTRUMENTS[doc.instrument];
    if (info.synth === "drums") {
      (event.drums ?? []).forEach((drum) => playDrum(ctx, ctx.destination, drum, now, 1));
      return;
    }
    const preview = playbackNotes({ ...doc, events: [{ ...event, tie: false }] })[0];
    preview?.midi.forEach((midi) => playTone(ctx, ctx.destination, info.synth, midi, now, 0.35, 1));
  }
}
