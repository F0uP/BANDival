import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { HttpError } from "@/lib/http";

/**
 * Click tracks for in-ear monitoring and backing-track rigs: one bar count-in, accent on the one,
 * as long as the song (rounded up to full bars). A setlist becomes one file with a pause between songs.
 */

export type ClickSegment = {
  title: string;
  bpm: number | null;
  /** e.g. "4/4", "6/8" – null = 4/4 */
  timeSignature: string | null;
  durationSeconds: number | null;
};

const RATE = 22050;
const DEFAULT_DURATION = 210;
const MAX_TOTAL_SECONDS = 4 * 3600;
const ffmpegBinary = () => process.env.FFMPEG_PATH?.trim() || "ffmpeg";

function meter(timeSignature: string | null): { beats: number; unit: number } {
  const match = timeSignature?.match(/^(\d{1,2})\/(\d{1,2})$/);
  const beats = match ? Math.min(16, Math.max(1, Number(match[1]))) : 4;
  const unit = match ? Number(match[2]) : 4;
  return { beats, unit };
}

/** Short decaying sine burst: 1.6 kHz for the one, 1 kHz for the other beats. */
function clickSound(frequency: number, gain: number): Int16Array {
  const length = Math.round(RATE * 0.045);
  const sound = new Int16Array(length);
  for (let index = 0; index < length; index += 1) {
    const time = index / RATE;
    const attack = Math.min(1, index / 30);
    sound[index] = Math.round(Math.sin(2 * Math.PI * frequency * time) * Math.exp(-time * 90) * attack * gain * 32767);
  }
  return sound;
}

const ACCENT = clickSound(1600, 0.85);
const BEAT = clickSound(1000, 0.6);

type Plan = Array<{ beats: number; samplesPerBeat: number; totalBeats: number; countInBeats: number; gapSamples: number }>;

function plan(segments: ClickSegment[], options: { countInBars: number; gapSeconds: number }): { plan: Plan; samples: number } {
  const result: Plan = [];
  let samples = 0;
  segments.forEach((segment, index) => {
    const isLast = index === segments.length - 1;
    const gapSamples = isLast ? Math.round(RATE * 1) : Math.round(RATE * options.gapSeconds);
    if (!segment.bpm || segment.bpm < 20 || segment.bpm > 400) {
      // No tempo: keep the song's length as silence so the set timing stays right.
      const silent = Math.round(RATE * (segment.durationSeconds ?? 0));
      result.push({ beats: 1, samplesPerBeat: Math.max(1, silent), totalBeats: 0, countInBeats: 0, gapSamples: silent + gapSamples });
      samples += silent + gapSamples;
      return;
    }
    const { beats } = meter(segment.timeSignature);
    const samplesPerBeat = (60 / segment.bpm) * RATE;
    const songBeats = Math.ceil(((segment.durationSeconds ?? DEFAULT_DURATION) * RATE) / samplesPerBeat / beats) * beats;
    const countInBeats = options.countInBars * beats;
    const totalBeats = countInBeats + songBeats;
    result.push({ beats, samplesPerBeat, totalBeats, countInBeats, gapSamples });
    samples += Math.round(totalBeats * samplesPerBeat) + gapSamples;
  });
  if (samples / RATE > MAX_TOTAL_SECONDS) throw new HttpError("Der Click-Track wäre länger als 4 Stunden.", 400);
  return { plan: result, samples };
}

function wavHeader(samples: number): Buffer {
  const dataBytes = samples * 2;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataBytes, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataBytes, 40);
  return header;
}

async function writeWav(file: string, segments: ClickSegment[], options: { countInBars: number; gapSeconds: number }) {
  const { plan: steps, samples } = plan(segments, options);
  const out = createWriteStream(file);
  const write = (chunk: Buffer) => new Promise<void>((resolve, reject) => (out.write(chunk, (error) => (error ? reject(error) : resolve()))));
  await write(wavHeader(samples));
  for (const step of steps) {
    const clickSamples = Math.round(step.totalBeats * step.samplesPerBeat);
    const buffer = new Int16Array(clickSamples + step.gapSamples);
    for (let beat = 0; beat < step.totalBeats; beat += 1) {
      const sound = beat % step.beats === 0 ? ACCENT : BEAT;
      const start = Math.round(beat * step.samplesPerBeat);
      buffer.set(sound.subarray(0, Math.max(0, Math.min(sound.length, buffer.length - start))), start);
    }
    await write(Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength));
  }
  await new Promise<void>((resolve, reject) => out.end((error?: Error | null) => (error ? reject(error) : resolve())));
}

function toMp3(input: string, output: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(ffmpegBinary(), ["-hide_banner", "-nostdin", "-v", "error", "-y", "-i", input, "-c:a", "libmp3lame", "-b:a", "96k", output], { stdio: "ignore", windowsHide: true });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

/** Builds the click track and returns a streaming response body (MP3, or WAV without ffmpeg). */
export async function clickTrackResponse(segments: ClickSegment[], options: { countInBars: number; gapSeconds: number; fileName: string }): Promise<Response> {
  const directory = await mkdtemp(path.join(tmpdir(), "bandival-click-"));
  const cleanup = () => void rm(directory, { recursive: true, force: true });
  try {
    const wav = path.join(directory, "click.wav");
    await writeWav(wav, segments, options);
    const mp3 = path.join(directory, "click.mp3");
    const encoded = await toMp3(wav, mp3);
    const file = encoded ? mp3 : wav;
    const size = (await stat(file)).size;
    const stream = createReadStream(file);
    stream.on("close", cleanup);
    const safeName = options.fileName.normalize("NFKD").replace(/[^\w.-]+/g, "-").slice(0, 80) || "click";
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        "Content-Type": encoded ? "audio/mpeg" : "audio/wav",
        "Content-Length": String(size),
        "Content-Disposition": `attachment; filename="${safeName}.${encoded ? "mp3" : "wav"}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    cleanup();
    throw error;
  }
}
