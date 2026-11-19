import { spawn, type ChildProcess } from "node:child_process";
import { rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { analyseRecording } from "@/lib/audio-analysis";
import { AUDIO_EXTENSIONS } from "@/lib/audio-formats";
import { HttpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { deleteUpload, MAX_AUDIO_BYTES, resolveUploadPath, saveUpload, type UploadScope } from "@/lib/storage";

/**
 * Audio uploads: anything ffmpeg can read is accepted – including the odd formats phone recorders
 * produce (Apple .caf / .m4a with ALAC, Android .amr / .3gp / .3ga, WhatsApp .opus, Samsung .m4a,
 * MediaRecorder .webm …) and videos with a sound track. Every upload is converted to MP3 in the
 * background, so all browsers and the Android app can play it; the original stays available for
 * song recordings and stems.
 */

const ACCEPTED_EXTENSIONS = new Set<string>(AUDIO_EXTENSIONS);

export function isAcceptedAudio(file: File): boolean {
  const extension = path.extname(file.name).toLowerCase();
  if (ACCEPTED_EXTENSIONS.has(extension)) return true;
  // No (or an unknown) extension: trust the browser's type, ffprobe has the final word.
  return file.type.startsWith("audio/") || file.type.startsWith("video/");
}

const ffmpegBinary = () => process.env.FFMPEG_PATH?.trim() || "ffmpeg";
const ffprobeBinary = () => process.env.FFPROBE_PATH?.trim() || "ffprobe";

type RunResult = { code: number | null; stdout: string; stderr: string };

function run(binary: string, args: string[], timeoutMs: number): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    track(child);
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => { if (stdout.length < 1_000_000) stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-4000); });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
  });
}

export type AudioProbe = {
  /** false = ffprobe is not installed – nothing could be checked or converted. */
  available: boolean;
  hasAudio: boolean;
  durationSeconds: number | null;
  codec: string | null;
  container: string | null;
  sampleRate: number | null;
  channels: number | null;
};

export async function probeAudio(absolutePath: string): Promise<AudioProbe> {
  const empty: AudioProbe = { available: false, hasAudio: false, durationSeconds: null, codec: null, container: null, sampleRate: null, channels: null };
  let result: RunResult;
  try {
    result = await run(ffprobeBinary(), ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", absolutePath], 30_000);
  } catch {
    return empty;
  }
  if (result.code !== 0) return { ...empty, available: true };
  try {
    const data = JSON.parse(result.stdout) as {
      streams?: Array<{ codec_type?: string; codec_name?: string; sample_rate?: string; channels?: number; duration?: string }>;
      format?: { format_name?: string; duration?: string };
    };
    const stream = data.streams?.find((entry) => entry.codec_type === "audio");
    const duration = Number(stream?.duration ?? data.format?.duration);
    return {
      available: true,
      hasAudio: Boolean(stream),
      durationSeconds: Number.isFinite(duration) && duration > 0 ? Math.round(duration) : null,
      codec: stream?.codec_name ?? null,
      container: data.format?.format_name ?? null,
      sampleRate: stream?.sample_rate ? Number(stream.sample_rate) : null,
      channels: stream?.channels ?? null,
    };
  } catch {
    return { ...empty, available: true };
  }
}

const MP3_RATES = [8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000];

/** Plain MP3 files are kept as they are – re-encoding would only cost quality. */
function needsTranscode(probe: AudioProbe): boolean {
  return !(probe.codec === "mp3" && (probe.container ?? "").split(",").includes("mp3"));
}

/** ffmpeg → MP3 (LAME VBR ~190 kbit/s), first audio stream only, metadata and cover art dropped. */
export async function transcodeToMp3(input: string, output: string, probe: AudioProbe): Promise<void> {
  const args = ["-hide_banner", "-nostdin", "-y", "-i", input, "-map", "0:a:0", "-vn", "-sn", "-dn", "-map_metadata", "-1"];
  if ((probe.channels ?? 2) > 2) args.push("-ac", "2");
  if (probe.sampleRate && !MP3_RATES.includes(probe.sampleRate)) args.push("-ar", probe.sampleRate > 48000 ? "48000" : "44100");
  args.push("-c:a", "libmp3lame", "-q:a", "2", "-f", "mp3", `${output}.part`);
  const result = await run(ffmpegBinary(), args, 15 * 60_000);
  if (result.code !== 0) {
    await unlink(`${output}.part`).catch(() => undefined);
    throw new Error(`ffmpeg exited with ${result.code}: ${result.stderr.split("\n").filter(Boolean).slice(-3).join(" | ")}`);
  }
  await rename(`${output}.part`, output);
}

export type StoredAudio = {
  /** URL of the uploaded file (served until the MP3 is ready). */
  fileUrl: string;
  mimeType: string;
  durationSeconds: number | null;
  /** "pending" when a conversion was queued, null if the file can be used as it is. */
  transcodeStatus: "pending" | null;
  /** ffmpeg is available – tempo/key can be estimated (after the conversion, or right away for MP3s). */
  analysable: boolean;
};

/**
 * Validates and stores an audio upload. Files without a sound track are rejected (when ffprobe is
 * available); the conversion itself is queued with {@link queueTranscode} once the row exists.
 */
export async function storeAudioUpload(file: File, scope: UploadScope, entityId: string): Promise<StoredAudio> {
  if (!isAcceptedAudio(file)) throw new HttpError("Dieses Dateiformat wird nicht unterstützt. Bitte eine Audio- oder Videodatei hochladen.", 400);
  const fileUrl = await saveUpload(file, scope, entityId, { maxBytes: MAX_AUDIO_BYTES, fallbackExtension: file.type.includes("mp4") ? ".m4a" : file.type.includes("webm") ? ".webm" : ".audio" });
  const probe = await probeAudio(resolveUploadPath(fileUrl)!);
  if (probe.available && !probe.hasAudio) {
    await deleteUpload(fileUrl);
    throw new HttpError("Die Datei enthält keine lesbare Tonspur.", 400);
  }
  return {
    fileUrl,
    mimeType: file.type || "application/octet-stream",
    durationSeconds: probe.durationSeconds,
    transcodeStatus: probe.available && needsTranscode(probe) ? "pending" : null,
    analysable: probe.available,
  };
}

// ---------------------------------------------------------------- background queue

export type TranscodeJob = { kind: "audio" | "stem" | "idea"; id: string; task?: "transcode" | "analyze" };

const queue: TranscodeJob[] = [];
/** The job being processed and its ffmpeg process – so a delete can stop it (Windows can't unlink open files). */
let activeJob: { key: string; child: ChildProcess | null } | null = null;

function track(child: ChildProcess) {
  if (activeJob) activeJob.child = child;
}
const queued = new Set<string>();
let running = false;

const jobKey = (job: TranscodeJob) => `${job.task ?? "transcode"}:${job.kind}:${job.id}`;

/** Converts in the background (one file at a time, so a big upload can't starve the server). */
export function queueTranscode(job: TranscodeJob) {
  if (queued.has(jobKey(job))) return;
  queued.add(jobKey(job));
  queue.push(job);
  if (!running) void drain();
}

async function drain() {
  running = true;
  try {
    for (let job = queue.shift(); job; job = queue.shift()) {
      try {
        activeJob = { key: jobKey(job), child: null };
        await processJob(job);
      } catch (error) {
        console.error(`[audio] conversion of ${jobKey(job)} failed:`, error instanceof Error ? error.message : error);
        await markFailed(job).catch(() => undefined);
      } finally {
        activeJob = null;
        queued.delete(jobKey(job));
      }
    }
  } finally {
    running = false;
  }
}

/** Waits until the queue is empty – used by tests and graceful shutdown. */
export async function transcodeQueueIdle(timeoutMs = 60_000): Promise<boolean> {
  const started = Date.now();
  while (running || queue.length > 0) {
    if (Date.now() - started > timeoutMs) return false;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return true;
}

async function loadSource(job: TranscodeJob): Promise<{ sourceUrl: string; keepOriginal: boolean } | null> {
  if (job.kind === "audio") {
    const row = await prisma.songAudioVersion.findUnique({ where: { id: job.id }, select: { fileUrl: true, originalFileUrl: true, transcodeStatus: true } });
    if (!row || row.transcodeStatus !== "pending") return null;
    return { sourceUrl: row.originalFileUrl ?? row.fileUrl, keepOriginal: true };
  }
  if (job.kind === "stem") {
    const row = await prisma.songStem.findUnique({ where: { id: job.id }, select: { fileUrl: true, originalFileUrl: true, transcodeStatus: true } });
    if (!row || row.transcodeStatus !== "pending") return null;
    return { sourceUrl: row.originalFileUrl ?? row.fileUrl, keepOriginal: true };
  }
  const row = await prisma.idea.findUnique({ where: { id: job.id }, select: { fileUrl: true, transcodeStatus: true } });
  if (!row?.fileUrl || row.transcodeStatus !== "pending") return null;
  return { sourceUrl: row.fileUrl, keepOriginal: false };
}

/** Tempo/key suggestion for a recording or idea (stems are single instruments – not analysed). */
async function analyse(job: TranscodeJob, fileUrl: string) {
  if (job.kind === "stem") return;
  const path = resolveUploadPath(fileUrl);
  if (!path) return;
  try {
    const result = await analyseRecording(path, null, track);
    const data = { detectedBpm: result.bpm, detectedKey: result.key };
    if (job.kind === "audio") await prisma.songAudioVersion.updateMany({ where: { id: job.id }, data });
    else await prisma.idea.updateMany({ where: { id: job.id }, data });
  } catch (error) {
    console.error(`[audio] analysis of ${jobKey(job)} failed:`, error instanceof Error ? error.message : error);
  }
}

async function processJob(job: TranscodeJob) {
  if (job.task === "analyze") {
    const row = job.kind === "audio"
      ? await prisma.songAudioVersion.findUnique({ where: { id: job.id }, select: { fileUrl: true } })
      : job.kind === "idea" ? await prisma.idea.findUnique({ where: { id: job.id }, select: { fileUrl: true } }) : null;
    if (row?.fileUrl) await analyse(job, row.fileUrl);
    return;
  }
  const source = await loadSource(job);
  if (!source) return;
  const input = resolveUploadPath(source.sourceUrl);
  if (!input) throw new Error("source outside the upload directory");
  const probe = await probeAudio(input);
  if (!probe.available) throw new Error("ffprobe not available");
  if (!probe.hasAudio) throw new Error("no audio stream");

  const mp3Url = source.sourceUrl.replace(/(\.[a-z0-9]{1,10})?$/i, "") + (source.sourceUrl.toLowerCase().endsWith(".mp3") ? ".converted.mp3" : ".mp3");
  const output = resolveUploadPath(mp3Url)!;
  await transcodeToMp3(input, output, probe);
  const size = (await stat(output)).size;

  // updateMany + count: the row may have been deleted while ffmpeg was running.
  let updated = 0;
  if (job.kind === "audio") {
    const current = await prisma.songAudioVersion.findUnique({ where: { id: job.id }, select: { durationSeconds: true } });
    updated = (await prisma.songAudioVersion.updateMany({
      where: { id: job.id, transcodeStatus: "pending" },
      data: { fileUrl: mp3Url, mimeType: "audio/mpeg", originalFileUrl: source.sourceUrl, transcodeStatus: "done", durationSeconds: current?.durationSeconds ?? probe.durationSeconds },
    })).count;
  } else if (job.kind === "stem") {
    updated = (await prisma.songStem.updateMany({
      where: { id: job.id, transcodeStatus: "pending" },
      data: { fileUrl: mp3Url, mimeType: "audio/mpeg", originalFileUrl: source.sourceUrl, fileSizeBytes: BigInt(size), transcodeStatus: "done" },
    })).count;
  } else {
    const current = await prisma.idea.findUnique({ where: { id: job.id }, select: { durationSeconds: true } });
    updated = (await prisma.idea.updateMany({
      where: { id: job.id, transcodeStatus: "pending" },
      data: { fileUrl: mp3Url, mimeType: "audio/mpeg", transcodeStatus: "done", durationSeconds: current?.durationSeconds ?? probe.durationSeconds },
    })).count;
  }
  if (updated === 0) {
    // Deleted meanwhile: remove what's left – on Windows the source can't be unlinked while ffmpeg reads it.
    await deleteUpload(mp3Url);
    if (!(await rowExists(job))) await deleteUpload(source.sourceUrl);
    return;
  }
  // Voice memos don't need their original; song recordings and stems keep it for download.
  if (!source.keepOriginal) await deleteUpload(source.sourceUrl);
  await analyse(job, mp3Url);
}

async function rowExists(job: TranscodeJob): Promise<boolean> {
  if (job.kind === "audio") return (await prisma.songAudioVersion.count({ where: { id: job.id } })) > 0;
  if (job.kind === "stem") return (await prisma.songStem.count({ where: { id: job.id } })) > 0;
  return (await prisma.idea.count({ where: { id: job.id } })) > 0;
}

async function markFailed(job: TranscodeJob) {
  if (job.task === "analyze") return;
  if (job.kind === "audio") await prisma.songAudioVersion.updateMany({ where: { id: job.id }, data: { transcodeStatus: "failed" } });
  else if (job.kind === "stem") await prisma.songStem.updateMany({ where: { id: job.id }, data: { transcodeStatus: "failed" } });
  else await prisma.idea.updateMany({ where: { id: job.id }, data: { transcodeStatus: "failed" } });
}

/** Re-queues conversions that were interrupted by a restart. */
export async function resumePendingTranscodes(): Promise<number> {
  const [audio, stems, ideas] = await Promise.all([
    prisma.songAudioVersion.findMany({ where: { transcodeStatus: "pending" }, select: { id: true } }),
    prisma.songStem.findMany({ where: { transcodeStatus: "pending" }, select: { id: true } }),
    prisma.idea.findMany({ where: { transcodeStatus: "pending" }, select: { id: true } }),
  ]);
  for (const row of audio) queueTranscode({ kind: "audio", id: row.id });
  for (const row of stems) queueTranscode({ kind: "stem", id: row.id });
  for (const row of ideas) queueTranscode({ kind: "idea", id: row.id });
  return audio.length + stems.length + ideas.length;
}

/** Removes the converted file and the original of a recording/stem/idea. */
export async function deleteAudioFiles(row: { fileUrl: string | null; originalFileUrl?: string | null }) {
  await deleteUpload(row.fileUrl);
  if (row.originalFileUrl && row.originalFileUrl !== row.fileUrl) await deleteUpload(row.originalFileUrl);
}

/** Input for stem separation: the lossless original if there is one, otherwise the playable file. */
export function separationSource(audio: { fileUrl: string; mimeType: string | null; originalFileUrl: string | null; originalMimeType: string | null }): { fileUrl: string; mimeType: string } {
  if (audio.originalFileUrl && /\.(wav|wave|flac|aif|aiff|aifc|w64|rf64|wv|ape|tta)$/i.test(audio.originalFileUrl)) {
    return { fileUrl: audio.originalFileUrl, mimeType: audio.originalMimeType || "audio/wav" };
  }
  return { fileUrl: audio.fileUrl, mimeType: audio.mimeType || "audio/mpeg" };
}

/** Stops queued and running conversions/analyses of a recording, stem or idea before its files are deleted. */
export async function cancelAudioWork(kind: TranscodeJob["kind"], id: string): Promise<void> {
  for (let index = queue.length - 1; index >= 0; index -= 1) {
    if (queue[index].kind === kind && queue[index].id === id) {
      queued.delete(jobKey(queue[index]));
      queue.splice(index, 1);
    }
  }
  const current = activeJob;
  const child = current?.child;
  if (!current || !current.key.endsWith(`:${kind}:${id}`) || !child || child.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 3000);
    child.once("close", () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill("SIGKILL");
  });
}
