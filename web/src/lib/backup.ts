import { mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { toJsonSafe } from "@/lib/http";

/** Complete JSON snapshot of a band (everything except uploaded files). */
export async function buildBandSnapshot(bandId: string) {
  const band = await prisma.band.findUnique({
    where: { id: bandId },
    select: { id: true, name: true, slug: true, description: true, timezone: true },
  });
  if (!band) return null;

  const [
    albums, songs, lyricsRevisions, audioVersions, attachments, threads, posts, setlists, setlistItems,
    rehearsalNotes, rehearsalTasks, kanbanTasks, events, availabilities, scores, parts, ideas, transactions,
  ] = await Promise.all([
    prisma.album.findMany({ where: { bandId } }),
    prisma.song.findMany({ where: { bandId } }),
    prisma.songLyricsRevision.findMany({ where: { song: { bandId } } }),
    prisma.songAudioVersion.findMany({ where: { song: { bandId } } }),
    prisma.songAttachment.findMany({ where: { song: { bandId } } }),
    prisma.discussionThread.findMany({ where: { song: { bandId } } }),
    prisma.discussionPost.findMany({ where: { thread: { song: { bandId } } } }),
    prisma.setlist.findMany({ where: { bandId } }),
    prisma.setlistItem.findMany({ where: { setlist: { bandId } } }),
    prisma.setlistRehearsalNote.findMany({ where: { setlist: { bandId } } }),
    prisma.setlistRehearsalTask.findMany({ where: { setlist: { bandId } } }),
    prisma.kanbanTask.findMany({ where: { bandId } }),
    prisma.event.findMany({ where: { bandId, status: { not: "availability_template" } } }),
    prisma.eventAvailability.findMany({ where: { event: { bandId, status: { not: "availability_template" } } } }),
    prisma.songScore.findMany({ where: { song: { bandId } } }),
    prisma.songPart.findMany({ where: { song: { bandId } } }),
    prisma.idea.findMany({ where: { bandId } }),
    prisma.financeTransaction.findMany({ where: { bandId } }),
  ]);

  return toJsonSafe({
    exportedAt: new Date().toISOString(),
    version: 3,
    data: {
      band, albums, songs, lyricsRevisions, audioVersions, attachments, threads, posts, setlists, setlistItems,
      rehearsalNotes, rehearsalTasks, kanbanTasks, events, availabilities, scores, parts, ideas, transactions,
    },
  });
}

export function getBackupDir(): string {
  return path.resolve(process.env.BACKUP_DIR ?? path.join(process.cwd(), "backups"));
}

/** Writes a daily JSON backup and removes files older than the retention period. */
export async function writeScheduledBackup(bandId: string, dateKey: string): Promise<string | null> {
  const snapshot = await buildBandSnapshot(bandId);
  if (!snapshot) return null;
  const directory = path.join(getBackupDir(), bandId);
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, `${dateKey}.json`);
  await writeFile(file, JSON.stringify(snapshot));

  const retentionDays = Math.max(1, Number(process.env.BACKUP_RETENTION_DAYS ?? 14) || 14);
  const cutoff = Date.now() - retentionDays * 86_400_000;
  for (const name of await readdir(directory)) {
    const full = path.join(directory, name);
    const info = await stat(full).catch(() => null);
    if (info && info.mtimeMs < cutoff && name.endsWith(".json")) {
      await unlink(full).catch(() => undefined);
    }
  }
  return file;
}

export async function listBackups(bandId: string): Promise<Array<{ name: string; size: number; createdAt: string }>> {
  const directory = path.join(getBackupDir(), bandId);
  const names = await readdir(directory).catch(() => [] as string[]);
  const entries = await Promise.all(names.filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name)).map(async (name) => {
    const info = await stat(path.join(directory, name));
    return { name, size: info.size, createdAt: info.mtime.toISOString() };
  }));
  return entries.sort((a, b) => b.name.localeCompare(a.name));
}
