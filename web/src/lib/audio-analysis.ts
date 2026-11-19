import { spawn, type ChildProcess } from "node:child_process";

/**
 * Tempo and key estimation for uploaded recordings – plain signal processing, no AI service:
 * - Tempo: spectral-flux onset envelope → autocorrelation with a log-normal prior around 120 BPM.
 * - Key: chromagram correlated with the Krumhansl–Kessler major/minor profiles.
 * The results are suggestions shown next to the song; they never overwrite what the band entered.
 */

const SAMPLE_RATE = 11025;
const ffmpegBinary = () => process.env.FFMPEG_PATH?.trim() || "ffmpeg";

/** Decodes up to 90 s (skipping a short intro) to mono float PCM at 11 025 Hz. */
export function decodeForAnalysis(input: string, durationSeconds: number | null, onSpawn?: (child: ChildProcess) => void): Promise<Float32Array> {
  const skip = durationSeconds && durationSeconds > 60 ? Math.min(20, Math.floor(durationSeconds * 0.1)) : 0;
  const args = ["-hide_banner", "-nostdin", "-v", "error", ...(skip ? ["-ss", String(skip)] : []), "-i", input, "-map", "0:a:0", "-t", "90", "-ac", "1", "-ar", String(SAMPLE_RATE), "-f", "f32le", "pipe:1"];
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegBinary(), args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    onSpawn?.(child);
    const chunks: Buffer[] = [];
    let size = 0;
    const timer = setTimeout(() => child.kill("SIGKILL"), 120_000);
    child.stdout.on("data", (chunk: Buffer) => { chunks.push(chunk); size += chunk.length; });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`ffmpeg exited with ${code}`));
      const buffer = Buffer.concat(chunks, size);
      const samples = new Float32Array(Math.floor(buffer.length / 4));
      for (let index = 0; index < samples.length; index += 1) samples[index] = buffer.readFloatLE(index * 4);
      resolve(samples);
    });
  });
}

/** In-place iterative radix-2 FFT. */
function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let length = 2; length <= n; length <<= 1) {
    const angle = (-2 * Math.PI) / length;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    for (let start = 0; start < n; start += length) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < length / 2; k += 1) {
        const a = start + k;
        const b = a + length / 2;
        const tRe = re[b] * curRe - im[b] * curIm;
        const tIm = re[b] * curIm + im[b] * curRe;
        re[b] = re[a] - tRe;
        im[b] = im[a] - tIm;
        re[a] += tRe;
        im[a] += tIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

function hann(size: number): Float64Array {
  const window = new Float64Array(size);
  for (let index = 0; index < size; index += 1) window[index] = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (size - 1));
  return window;
}

/** Magnitude spectra of all frames (only the first `bins` bins). */
function* spectra(samples: Float32Array, size: number, hop: number, bins = size / 2): Generator<Float64Array> {
  const window = hann(size);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let start = 0; start + size <= samples.length; start += hop) {
    for (let index = 0; index < size; index += 1) {
      re[index] = samples[start + index] * window[index];
      im[index] = 0;
    }
    fft(re, im);
    const magnitude = new Float64Array(bins);
    for (let k = 0; k < bins; k += 1) magnitude[k] = Math.hypot(re[k], im[k]);
    yield magnitude;
  }
}

export function estimateTempo(samples: Float32Array): { bpm: number; confidence: number } | null {
  const size = 1024;
  const hop = 128;
  const fps = SAMPLE_RATE / hop;
  if (samples.length < SAMPLE_RATE * 6) return null;

  // Onset strength: positive change of the log-compressed spectrum
  const flux: number[] = [];
  let levelSum = 0;
  let previous: Float64Array | null = null;
  for (const magnitude of spectra(samples, size, hop)) {
    const compressed = magnitude.map((value) => Math.log1p(100 * value));
    let sum = 0;
    if (previous) for (let k = 1; k < compressed.length; k += 1) sum += Math.max(0, compressed[k] - previous[k]);
    flux.push(sum);
    levelSum += compressed.reduce((total, value) => total + value, 0);
    previous = compressed;
  }
  // Remove the slowly varying loudness (local mean over ~0.5 s) and keep only rises
  const radius = Math.round(fps * 0.25);
  const envelope = new Float64Array(flux.length);
  let running = 0;
  for (let index = 0; index < flux.length + radius; index += 1) {
    if (index < flux.length) running += flux[index];
    if (index - 2 * radius - 1 >= 0) running -= flux[index - 2 * radius - 1];
    const center = index - radius;
    if (center >= 0 && center < flux.length) {
      const count = Math.min(flux.length - 1, center + radius) - Math.max(0, center - radius) + 1;
      envelope[center] = Math.max(0, flux[center] - running / count);
    }
  }
  const energy = envelope.reduce((sum, value) => sum + value * value, 0);
  if (energy <= 1e-9) return null;
  // Sustained sounds without attacks (pads, drones) have no tempo – their envelope is ~100× weaker than music with hits.
  const onsetRatio = envelope.reduce((sum, value) => sum + value, 0) / envelope.length / (levelSum / flux.length || 1);
  if (onsetRatio < 0.02) return null;

  const minLag = Math.floor((60 * fps) / 210);
  const maxLag = Math.ceil((60 * fps) / 55);
  const autocorrelation = new Float64Array(maxLag + 2);
  for (let lag = minLag - 1; lag <= maxLag + 1; lag += 1) {
    let sum = 0;
    for (let index = lag; index < envelope.length; index += 1) sum += envelope[index] * envelope[index - lag];
    autocorrelation[lag] = sum / energy;
  }

  let bestLag = 0;
  let bestScore = -Infinity;
  const scores: number[] = [];
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    const bpm = (60 * fps) / lag;
    // Listeners hear tempi around 120 BPM most easily – the prior settles octave ambiguities.
    const prior = Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.9) ** 2);
    const score = autocorrelation[lag] * prior;
    scores.push(score);
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  if (!bestLag || bestScore <= 0) return null;
  // Parabolic interpolation around the peak for sub-frame precision
  const left = autocorrelation[bestLag - 1];
  const center = autocorrelation[bestLag];
  const right = autocorrelation[bestLag + 1];
  const denominator = left - 2 * center + right;
  const offset = denominator !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (left - right)) / denominator)) : 0;
  const bpm = (60 * fps) / (bestLag + offset);
  const mean = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  const confidence = Math.max(0, Math.min(1, (bestScore - mean) / (bestScore || 1)));
  return { bpm: Math.round(bpm * 10) / 10, confidence };
}

const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const MAJOR_NAMES = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const MINOR_NAMES = ["Cm", "C#m", "Dm", "Ebm", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "Bbm", "Bm"];

function pearson(a: number[], b: number[]): number {
  const meanA = a.reduce((sum, value) => sum + value, 0) / a.length;
  const meanB = b.reduce((sum, value) => sum + value, 0) / b.length;
  let numerator = 0;
  let sumA = 0;
  let sumB = 0;
  for (let index = 0; index < a.length; index += 1) {
    numerator += (a[index] - meanA) * (b[index] - meanB);
    sumA += (a[index] - meanA) ** 2;
    sumB += (b[index] - meanB) ** 2;
  }
  return sumA && sumB ? numerator / Math.sqrt(sumA * sumB) : 0;
}

export function estimateKey(samples: Float32Array): { key: string; confidence: number } | null {
  const size = 8192;
  const hop = 4096;
  const bins = size / 2;
  // Pitch class of every FFT bin between ~C2 and ~C7
  const pitchClass = new Int8Array(bins).fill(-1);
  for (let k = 1; k < bins; k += 1) {
    const frequency = (k * SAMPLE_RATE) / size;
    if (frequency < 65 || frequency > 2100) continue;
    const midi = 69 + 12 * Math.log2(frequency / 440);
    pitchClass[k] = ((Math.round(midi) % 12) + 12) % 12;
  }
  const chroma = new Array(12).fill(0);
  let frames = 0;
  for (const magnitude of spectra(samples, size, hop, bins)) {
    const frame = new Array(12).fill(0);
    for (let k = 1; k < bins; k += 1) if (pitchClass[k] >= 0) frame[pitchClass[k]] += magnitude[k];
    const total = frame.reduce((sum, value) => sum + value, 0);
    if (total <= 1e-6) continue;
    // Each frame counts equally, so a few loud hits don't decide the key
    for (let pc = 0; pc < 12; pc += 1) chroma[pc] += frame[pc] / total;
    frames += 1;
  }
  if (frames < 3) return null;

  const candidates: Array<{ key: string; score: number }> = [];
  for (let tonic = 0; tonic < 12; tonic += 1) {
    const rotated = chroma.map((_, pc) => chroma[(pc + tonic) % 12]);
    candidates.push({ key: MAJOR_NAMES[tonic], score: pearson(rotated, MAJOR_PROFILE) });
    candidates.push({ key: MINOR_NAMES[tonic], score: pearson(rotated, MINOR_PROFILE) });
  }
  candidates.sort((a, b) => b.score - a.score);
  const [best, second] = candidates;
  // Below ~0.6 the chroma doesn't resemble any key (single tones, noise, atonal material).
  if (!best || best.score < 0.6) return null;
  return { key: best.key, confidence: Math.max(0, Math.min(1, (best.score - (second?.score ?? 0)) * 4 + best.score / 2)) };
}

/** Analyses a stored file; returns only what is reasonably certain. */
export async function analyseRecording(absolutePath: string, durationSeconds: number | null, onSpawn?: (child: ChildProcess) => void): Promise<{ bpm: number | null; key: string | null }> {
  const samples = await decodeForAnalysis(absolutePath, durationSeconds, onSpawn);
  const tempo = estimateTempo(samples);
  const key = estimateKey(samples);
  return {
    bpm: tempo && tempo.confidence >= 0.5 ? tempo.bpm : null,
    key: key?.key ?? null,
  };
}
