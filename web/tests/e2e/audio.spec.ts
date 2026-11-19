import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { registerUser, toneWav, type ApiClient } from "./helpers";

// The fixtures are created with ffmpeg – GitHub's ubuntu runners ship it; without it the test is skipped.
const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
const hasFfmpeg = spawnSync(ffmpeg, ["-version"], { stdio: "ignore" }).status === 0;

type Version = { id: string; fileUrl: string; fileName: string; mimeType: string; originalFileUrl: string | null; transcodeStatus: string | null; durationSeconds: number | null };

const encoders = hasFfmpeg ? spawnSync(ffmpeg, ["-hide_banner", "-encoders"]).stdout.toString() : "";
/** Distro builds differ (Ubuntu's ffmpeg has no libopencore/libopus encoders everywhere) – fall back to ffmpeg's own. */
const opusArgs = /\slibopus\s/.test(encoders) ? ["-c:a", "libopus", "-b:a", "24k"] : ["-ar", "48000", "-c:a", "opus", "-strict", "experimental", "-b:a", "32k"];

/** Formats phone recorders and DAWs produce: [file name, MIME type the browser sends, ffmpeg output args]. */
const FIXTURES: Array<[string, string, string[]]> = [
  ["iphone-memo.m4a", "audio/x-m4a", ["-c:a", "aac", "-b:a", "64k"]],
  ["garageband.caf", "application/octet-stream", ["-c:a", "pcm_s16le", "-f", "caf"]],
  ["samsung-call.3gp", "video/3gpp", ["-c:a", "aac", "-b:a", "48k", "-f", "3gp"]],
  ["whatsapp.opus", "audio/ogg", opusArgs],
  ["master.flac", "audio/flac", ["-c:a", "flac"]],
];

/**
 * AMR-NB voice memo (as Android recorders write it), built byte by byte – most ffmpeg builds can decode AMR
 * but have no encoder. Storage format per RFC 4867 §5: magic "#!AMR\n" + 20 ms frames (mode 7: 1 header + 31 payload bytes).
 */
function amrMemo(seconds: number): Buffer {
  const parts = [Buffer.from("#!AMR\n")];
  for (let index = 0; index < seconds * 50; index += 1) {
    const frame = Buffer.alloc(32);
    frame[0] = (7 << 3) | (1 << 2);
    for (let byte = 1; byte < 32; byte += 1) frame[byte] = (index * 31 + byte * 7) & 0xff;
    parts.push(frame);
  }
  return Buffer.concat(parts);
}

/** 3 s / 440 Hz in the given format; `video` adds a black picture track (or replaces the sound). */
function makeFixture(dir: string, name: string, args: string[], video: "none" | "with-audio" | "only" = "none"): Buffer {
  const output = path.join(dir, name);
  const inputs = ["-f", "lavfi", "-i", "sine=frequency=440:duration=3:sample_rate=44100"];
  const picture = ["-f", "lavfi", "-i", "color=c=black:s=64x64:d=3"];
  const full = video === "none"
    ? [...inputs, ...args]
    : video === "with-audio"
      ? [...inputs, ...picture, "-map", "0:a", "-map", "1:v", "-c:v", "mpeg4", "-c:a", "aac", "-shortest", ...args]
      : [...picture, "-c:v", "mpeg4", ...args];
  const result = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", ...full, output]);
  if (result.status !== 0) throw new Error(`fixture ${name}: ${result.stderr.toString()}`);
  return readFileSync(output);
}

async function waitForConversions(api: ApiClient, songId: string, expected: number): Promise<Version[]> {
  let versions: Version[] = [];
  await expect.poll(async () => {
    const detail = await api.json<{ song: { audioVersions: Version[] } }>(api.get(`/api/songs/${songId}`));
    versions = detail.song.audioVersions;
    return versions.filter((version) => version.transcodeStatus !== "pending").length;
  }, { timeout: 90_000, intervals: [500, 1000, 2000] }).toBe(expected);
  return versions;
}

test.describe("audio uploads", () => {
  test.skip(!hasFfmpeg, "ffmpeg is not installed");

  test("phone and DAW formats are converted to MP3, originals are kept", async ({ baseURL }) => {
    test.setTimeout(180_000);
    const dir = mkdtempSync(path.join(tmpdir(), "bandival-audio-"));
    try {
      const { api, bandId } = await registerUser(baseURL!);
      const { song } = await api.json<{ song: { id: string } }>(api.post("/api/songs", { bandId, title: "Formats", spotifyUrl: "" }), 201);

      const uploads: Array<[string, string, Buffer]> = [
        ...FIXTURES.map(([name, mimeType, args]) => [name, mimeType, makeFixture(dir, name, args)] as [string, string, Buffer]),
        ["android-recorder.amr", "application/octet-stream", amrMemo(3)],
        ["rehearsal-clip.mp4", "video/mp4", makeFixture(dir, "rehearsal-clip.mp4", [], "with-audio")],
      ];
      for (const [name, mimeType, buffer] of uploads) {
        const { audioVersion } = await api.json<{ audioVersion: Version }>(api.upload(`/api/songs/${song.id}/audio`, { file: { name, mimeType, buffer } }), 201);
        expect(audioVersion.transcodeStatus, name).toBe("pending");
      }

      const versions = await waitForConversions(api, song.id, uploads.length);
      for (const version of versions) {
        expect(version.transcodeStatus, version.fileName).toBe("done");
        expect(version.mimeType, version.fileName).toBe("audio/mpeg");
        expect(version.fileUrl, version.fileName).toMatch(/\.mp3$/);
        expect(version.originalFileUrl, version.fileName).toMatch(new RegExp(`\\${path.extname(version.fileName)}$`));
        expect(version.durationSeconds, version.fileName).toBe(3);
        const mp3 = await api.ctx.get(version.fileUrl);
        expect(mp3.status()).toBe(200);
        expect(mp3.headers()["content-type"]).toContain("audio/mpeg");
        const head = await mp3.body();
        // ID3 tag or an MPEG frame sync
        expect(head.subarray(0, 3).toString() === "ID3" || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0), version.fileName).toBeTruthy();
        expect((await api.ctx.get(version.originalFileUrl!)).status(), `original ${version.fileName}`).toBe(200);
      }

      // Not audio at all, a video without sound, a document
      await api.json(api.upload(`/api/songs/${song.id}/audio`, { file: { name: "fake.m4a", mimeType: "audio/mp4", buffer: Buffer.from("definitely not audio".repeat(50)) } }), 400);
      const silentVideo = makeFixture(dir, "silent.mp4", [], "only");
      await api.json(api.upload(`/api/songs/${song.id}/audio`, { file: { name: "silent.mp4", mimeType: "video/mp4", buffer: silentVideo } }), 400);
      await api.json(api.upload(`/api/songs/${song.id}/audio`, { file: { name: "notes.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") } }), 400);

      // Deleting a version removes the MP3 and the original
      const victim = versions[0];
      await api.json(api.delete(`/api/songs/${song.id}/audio/${victim.id}`));
      expect((await api.ctx.get(victim.fileUrl)).status()).toBe(404);
      expect((await api.ctx.get(victim.originalFileUrl!)).status()).toBe(404);

      // Plain MP3s are not re-encoded
      const mp3 = makeFixture(dir, "already.mp3", ["-c:a", "libmp3lame", "-q:a", "4"]);
      const { audioVersion } = await api.json<{ audioVersion: Version }>(api.upload(`/api/songs/${song.id}/audio`, { file: { name: "already.mp3", mimeType: "audio/mpeg", buffer: mp3 } }), 201);
      expect(audioVersion.transcodeStatus).toBeNull();
      expect(audioVersion.durationSeconds).toBe(3);

      // Voice memo as an idea: converted, the original is not kept
      const memo = amrMemo(3);
      const { idea } = await api.json<{ idea: { id: string; fileUrl: string; transcodeStatus: string } }>(
        api.upload("/api/ideas", { bandId, title: "Memo", file: { name: "memo.amr", mimeType: "audio/amr", buffer: memo } }),
        201,
      );
      expect(idea.transcodeStatus).toBe("pending");
      await expect.poll(async () => {
        const list = await api.json<{ ideas: Array<{ id: string; fileUrl: string }> }>(api.get(`/api/ideas?bandId=${bandId}`));
        return list.ideas.find((entry) => entry.id === idea.id)?.fileUrl ?? "";
      }, { timeout: 60_000 }).toMatch(/\.mp3$/);
      expect((await api.ctx.get(idea.fileUrl)).status()).toBe(404);

      // Stems: a WAV stem is converted, the WAV stays downloadable
      const { stem } = await api.json<{ stem: { id: string } }>(
        api.upload(`/api/songs/${song.id}/stems`, { label: "Bass", file: { name: "bass.wav", mimeType: "audio/wav", buffer: toneWav(64_044, 16000) } }),
        201,
      );
      await expect.poll(async () => {
        const list = await api.json<{ stems: Array<{ id: string; fileUrl: string; originalFileUrl: string | null; transcodeStatus: string }> }>(api.get(`/api/songs/${song.id}/stems`));
        const entry = list.stems.find((candidate) => candidate.id === stem.id);
        return Boolean(entry && entry.transcodeStatus === "done" && entry.fileUrl.endsWith(".mp3") && entry.originalFileUrl?.endsWith(".wav"));
      }, { timeout: 60_000 }).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("tempo and key are estimated from the recording", async ({ baseURL }) => {
    test.setTimeout(120_000);
    const dir = mkdtempSync(path.join(tmpdir(), "bandival-analysis-"));
    try {
      const { api, bandId } = await registerUser(baseURL!);
      const { song } = await api.json<{ song: { id: string } }>(api.post("/api/songs", { bandId, title: "Groove", spotifyUrl: "" }), 201);
      // Kick on 1/3, snare on 2/4, eighth hi-hats at 128 BPM over an A minor chord
      const beat = "60/128";
      const expression = `0.8*sin(2*PI*55*t)*exp(-30*mod(t\,2*${beat}))+0.5*(random(0)*2-1)*exp(-40*mod(t+${beat}\,2*${beat}))+0.15*(random(1)*2-1)*exp(-120*mod(t\,${beat}/2))+0.15*sin(2*PI*220*t)+0.12*sin(2*PI*261.63*t)+0.12*sin(2*PI*329.63*t)`;
      const output = path.join(dir, "groove.wav");
      const result = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", `aevalsrc='${expression}':s=44100:d=40`, output]);
      expect(result.status, result.stderr?.toString()).toBe(0);
      const { audioVersion } = await api.json<{ audioVersion: Version }>(api.upload(`/api/songs/${song.id}/audio`, { file: { name: "groove.wav", mimeType: "audio/wav", buffer: readFileSync(output) } }), 201);
      let detected: { detectedBpm: number | null; detectedKey: string | null } = { detectedBpm: null, detectedKey: null };
      await expect.poll(async () => {
        const detail = await api.json<{ song: { audioVersions: Array<Version & { detectedBpm: number | null; detectedKey: string | null }> } }>(api.get(`/api/songs/${song.id}`));
        detected = detail.song.audioVersions.find((version) => version.id === audioVersion.id)!;
        return detected.detectedBpm;
      }, { timeout: 90_000 }).not.toBeNull();
      expect(Math.abs((detected.detectedBpm ?? 0) - 128)).toBeLessThan(2);
      expect(detected.detectedKey).toBe("Am");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
