import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { stemSeparationConfig } from "@/lib/ai";
import { HttpError } from "@/lib/http";
import { getUploadRoot, resolveUploadPath } from "@/lib/storage";
import { notifyBandMembers } from "@/lib/notifications";

/**
 * Client for the optional self-hosted stem-splitter service (services/stem-splitter, Demucs).
 * Protocol:  POST /jobs (multipart "file", "model") → {id}
 *            GET  /jobs/:id → {status: queued|running|done|failed, stems?: string[], error?}
 *            GET  /jobs/:id/stems/:name → audio/mpeg
 *            DELETE /jobs/:id
 */

const STEM_LABEL: Record<string, string> = {
  vocals: "Gesang", drums: "Drums", bass: "Bass", other: "Rest (Gitarre, Keys …)", guitar: "Gitarre", piano: "Piano / Keys",
};

function headers(): Record<string, string> {
  const config = stemSeparationConfig();
  return config?.token ? { Authorization: `Bearer ${config.token}` } : {};
}

function requireConfig() {
  const config = stemSeparationConfig();
  if (!config) throw new HttpError("Spurtrennung ist auf diesem Server nicht eingerichtet (STEM_SEPARATION_URL).", 501);
  return config;
}

export async function startStemSeparation(args: { bandId: string; userId: string; songId: string; audioVersionId: string; fileUrl: string; fileName: string; mimeType: string }) {
  const config = requireConfig();
  const running = await prisma.aiJob.count({ where: { kind: "stem_separation", audioVersionId: args.audioVersionId, status: { in: ["queued", "running"] } } });
  if (running > 0) throw new HttpError("Für diese Aufnahme läuft bereits eine Spurtrennung.", 409);

  const absolute = resolveUploadPath(args.fileUrl);
  if (!absolute) throw new HttpError("Audiodatei nicht gefunden.", 404);
  const bytes = await readFile(absolute);

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)], { type: args.mimeType }), args.fileName);
  form.append("model", process.env.STEM_SEPARATION_MODEL?.trim() || "htdemucs");
  let response: Response;
  try {
    response = await fetch(`${config.url}/jobs`, { method: "POST", headers: headers(), body: form, signal: AbortSignal.timeout(120_000) });
  } catch (error) {
    throw new HttpError(`Spurtrennungs-Dienst nicht erreichbar: ${(error as Error).message}`, 502);
  }
  const data = await response.json().catch(() => null) as { id?: string; detail?: string } | null;
  if (!response.ok || !data?.id) throw new HttpError(`Spurtrennung konnte nicht gestartet werden: ${data?.detail ?? response.status}`, 502);

  return prisma.aiJob.create({
    data: {
      bandId: args.bandId,
      userId: args.userId,
      kind: "stem_separation",
      status: "queued",
      songId: args.songId,
      audioVersionId: args.audioVersionId,
      externalId: data.id,
    },
  });
}

/** Polls a job; when finished, downloads the stems into the song's upload folder and creates SongStem rows. */
export async function refreshStemJob(jobId: string) {
  const job = await prisma.aiJob.findUnique({ where: { id: jobId } });
  if (!job || job.kind !== "stem_separation" || !job.externalId || job.status === "done" || job.status === "failed") return job;
  const config = stemSeparationConfig();
  if (!config) return job;

  let state: { status?: string; stems?: string[]; error?: string } | null = null;
  try {
    const response = await fetch(`${config.url}/jobs/${encodeURIComponent(job.externalId)}`, { headers: headers(), signal: AbortSignal.timeout(15_000) });
    state = await response.json().catch(() => null);
    if (response.status === 404) state = { status: "failed", error: "Job beim Dienst nicht mehr vorhanden." };
  } catch {
    return job; // try again later
  }
  if (!state?.status) return job;

  if (state.status === "failed") {
    return prisma.aiJob.update({ where: { id: job.id }, data: { status: "failed", error: (state.error ?? "Unbekannter Fehler").slice(0, 500) } });
  }
  if (state.status !== "done") {
    return job.status === state.status ? job : prisma.aiJob.update({ where: { id: job.id }, data: { status: state.status === "running" ? "running" : "queued" } });
  }

  // Claim the import so that the scheduler and a polling client don't import twice.
  const claimed = await prisma.aiJob.updateMany({ where: { id: job.id, status: { in: ["queued", "running"] } }, data: { status: "importing" } });
  if (claimed.count === 0) return prisma.aiJob.findUnique({ where: { id: job.id } });

  try {
    const songId = job.songId!;
    const directory = path.join(getUploadRoot(), "audio", songId);
    await mkdir(directory, { recursive: true });
    const created: string[] = [];
    const existing = await prisma.songStem.count({ where: { songId } });
    for (const [position, name] of (state.stems ?? []).entries()) {
      const response = await fetch(`${config.url}/jobs/${encodeURIComponent(job.externalId)}/stems/${encodeURIComponent(name)}`, { headers: headers(), signal: AbortSignal.timeout(120_000) });
      if (!response.ok) continue;
      const fileName = `${Date.now()}-${randomUUID()}.mp3`;
      await writeFile(path.join(directory, fileName), Buffer.from(await response.arrayBuffer()));
      const label = `${STEM_LABEL[name] ?? name} (KI)`;
      await prisma.songStem.create({
        data: { songId, label, fileUrl: `/uploads/audio/${songId}/${fileName}`, fileName: `${name}.mp3`, mimeType: "audio/mpeg", sortOrder: existing + position },
      });
      created.push(label);
    }
    await fetch(`${config.url}/jobs/${encodeURIComponent(job.externalId)}`, { method: "DELETE", headers: headers() }).catch(() => undefined);
    const done = await prisma.aiJob.update({ where: { id: job.id }, data: { status: "done", result: { stems: created } as Prisma.InputJsonValue } });
    const song = await prisma.song.findUnique({ where: { id: songId }, select: { title: true } });
    await notifyBandMembers({
      bandId: job.bandId,
      kind: "song",
      type: "stems_ready",
      title: `Spuren für „${song?.title ?? "Song"}“ sind fertig`,
      body: created.join(", "),
      payload: { songId, url: `/app/songs/${songId}?tab=files` },
    });
    return done;
  } catch (error) {
    return prisma.aiJob.update({ where: { id: job.id }, data: { status: "failed", error: (error as Error).message.slice(0, 500) } });
  }
}

/** Scheduler hook: advance all open jobs. */
export async function refreshOpenStemJobs(): Promise<void> {
  const jobs = await prisma.aiJob.findMany({ where: { kind: "stem_separation", status: { in: ["queued", "running"] } }, select: { id: true }, take: 20 });
  for (const job of jobs) await refreshStemJob(job.id);
  // Jobs stuck in "importing" (e.g. server restart during download) are retried after 30 minutes.
  await prisma.aiJob.updateMany({ where: { status: "importing", updatedAt: { lt: new Date(Date.now() - 30 * 60_000) } }, data: { status: "running" } });
}
