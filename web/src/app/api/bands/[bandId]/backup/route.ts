import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AuthError, requireAuthUser, requireBandAction, writeAuditLog } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse, toJsonSafe } from "@/lib/http";

type Context = { params: Promise<{ bandId: string }> };

type Row = Record<string, unknown>;

const rows = z.array(z.record(z.string(), z.unknown())).default([]);

const backupSchema = z.object({
  version: z.number().optional(),
  data: z.object({
    band: z.object({ id: z.string(), name: z.string() }).passthrough(),
    albums: rows,
    songs: rows,
    lyricsRevisions: rows,
    audioVersions: rows,
    attachments: rows,
    threads: rows,
    posts: rows,
    setlists: rows,
    setlistItems: rows,
    rehearsalNotes: rows,
    rehearsalTasks: rows,
    kanbanTasks: rows,
    events: rows,
    availabilities: rows,
  }),
});

export async function GET(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const bandId = parseUuid((await context.params).bandId, "Band-ID");
    await requireBandAction(session.userId, bandId, "backup.export");

    const band = await prisma.band.findUnique({
      where: { id: bandId },
      select: { id: true, name: true, slug: true, description: true, timezone: true },
    });
    if (!band) {
      throw new AuthError("Band nicht gefunden.", 404);
    }

    const [
      albums,
      songs,
      lyricsRevisions,
      audioVersions,
      attachments,
      threads,
      posts,
      setlists,
      setlistItems,
      rehearsalNotes,
      rehearsalTasks,
      kanbanTasks,
      events,
      availabilities,
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
    ]);

    const snapshot = {
      exportedAt: new Date().toISOString(),
      version: 2,
      data: {
        band,
        albums,
        songs,
        lyricsRevisions,
        audioVersions,
        attachments,
        threads,
        posts,
        setlists,
        setlistItems,
        rehearsalNotes,
        rehearsalTasks,
        kanbanTasks,
        events,
        availabilities,
      },
    };

    return NextResponse.json(toJsonSafe(snapshot), {
      headers: {
        "Content-Disposition": `attachment; filename="bandival-backup-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (error) {
    return errorResponse(error, "Backup konnte nicht exportiert werden.");
  }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const bandId = parseUuid((await context.params).bandId, "Band-ID");
    await requireBandAction(session.userId, bandId, "backup.restore");

    const raw = (await request.json()) as Row;
    // Accept both the raw snapshot and the legacy `{ payload: snapshot }` wrapper.
    const candidate = raw && typeof raw === "object" && "payload" in raw ? raw.payload : raw;
    const parsed = backupSchema.safeParse(candidate);
    if (!parsed.success) {
      throw new AuthError("Die Datei ist kein gültiges Bandival-Backup.", 400);
    }
    const snapshot = parsed.data.data;
    if (snapshot.band.id !== bandId) {
      throw new AuthError("Dieses Backup gehört zu einer anderen Band.", 400);
    }

    // Users referenced in the backup may no longer exist – remap or drop those references.
    const referencedUserIds = new Set<string>();
    const collect = (list: Row[], key: string) => list.forEach((row) => {
      if (typeof row[key] === "string") referencedUserIds.add(row[key] as string);
    });
    collect(snapshot.songs, "createdBy");
    collect(snapshot.threads, "createdByUserId");
    collect(snapshot.posts, "createdByUserId");
    collect(snapshot.rehearsalNotes, "updatedByUserId");
    collect(snapshot.rehearsalTasks, "updatedByUserId");
    collect(snapshot.rehearsalTasks, "assigneeUserId");
    collect(snapshot.kanbanTasks, "updatedByUserId");
    collect(snapshot.availabilities, "userId");
    const existingUsers = new Set(
      (await prisma.appUser.findMany({ where: { id: { in: Array.from(referencedUserIds) } }, select: { id: true } })).map((user) => user.id),
    );
    const userOrNull = (value: unknown) => (typeof value === "string" && existingUsers.has(value) ? value : null);
    const userOrSelf = (value: unknown) => userOrNull(value) ?? session.userId;

    const withBand = (list: Row[]): Row[] => list.map((row) => ({ ...row, bandId }));

    await prisma.$transaction(async (tx) => {
      await tx.kanbanTask.deleteMany({ where: { bandId } });
      await tx.discussionPost.deleteMany({ where: { thread: { song: { bandId } } } });
      await tx.discussionThread.deleteMany({ where: { song: { bandId } } });
      await tx.songAudioVersion.deleteMany({ where: { song: { bandId } } });
      await tx.songAttachment.deleteMany({ where: { song: { bandId } } });
      await tx.songLyricsRevision.deleteMany({ where: { song: { bandId } } });
      await tx.setlistRehearsalTask.deleteMany({ where: { setlist: { bandId } } });
      await tx.setlistRehearsalNote.deleteMany({ where: { setlist: { bandId } } });
      await tx.setlistItem.deleteMany({ where: { setlist: { bandId } } });
      await tx.eventAvailability.deleteMany({ where: { event: { bandId } } });
      await tx.event.deleteMany({ where: { bandId } });
      await tx.setlist.deleteMany({ where: { bandId } });
      await tx.song.deleteMany({ where: { bandId } });
      await tx.album.deleteMany({ where: { bandId } });

      await tx.album.createMany({ data: withBand(snapshot.albums) as never[], skipDuplicates: true });
      await tx.song.createMany({
        data: withBand(snapshot.songs).map((row) => ({ ...row, createdBy: userOrNull(row.createdBy) })) as never[],
        skipDuplicates: true,
      });
      await tx.songLyricsRevision.createMany({ data: snapshot.lyricsRevisions as never[], skipDuplicates: true });
      await tx.songAudioVersion.createMany({ data: snapshot.audioVersions as never[], skipDuplicates: true });
      await tx.songAttachment.createMany({
        data: snapshot.attachments.map((row) => ({
          ...row,
          fileSizeBytes: row.fileSizeBytes === null || row.fileSizeBytes === undefined ? null : BigInt(String(row.fileSizeBytes)),
        })) as never[],
        skipDuplicates: true,
      });
      await tx.discussionThread.createMany({
        data: snapshot.threads.map((row) => ({ ...row, createdByUserId: userOrNull(row.createdByUserId) })) as never[],
        skipDuplicates: true,
      });
      await tx.discussionPost.createMany({
        data: snapshot.posts.map((row) => ({ ...row, createdByUserId: userOrNull(row.createdByUserId) })) as never[],
        skipDuplicates: true,
      });
      await tx.setlist.createMany({ data: withBand(snapshot.setlists) as never[], skipDuplicates: true });
      await tx.setlistItem.createMany({ data: snapshot.setlistItems as never[], skipDuplicates: true });
      await tx.setlistRehearsalNote.createMany({
        data: snapshot.rehearsalNotes.map((row) => ({ ...row, updatedByUserId: userOrSelf(row.updatedByUserId) })) as never[],
        skipDuplicates: true,
      });
      await tx.setlistRehearsalTask.createMany({
        data: snapshot.rehearsalTasks.map((row) => ({
          ...row,
          updatedByUserId: userOrSelf(row.updatedByUserId),
          assigneeUserId: userOrNull(row.assigneeUserId),
        })) as never[],
        skipDuplicates: true,
      });
      await tx.event.createMany({ data: withBand(snapshot.events) as never[], skipDuplicates: true });
      await tx.eventAvailability.createMany({
        data: snapshot.availabilities.filter((row) => userOrNull(row.userId)) as never[],
        skipDuplicates: true,
      });
      await tx.kanbanTask.createMany({
        data: withBand(snapshot.kanbanTasks).map((row) => ({ ...row, updatedByUserId: userOrSelf(row.updatedByUserId) })) as never[],
        skipDuplicates: true,
      });
    }, { timeout: 60_000 });

    await writeAuditLog({
      bandId,
      actorUserId: session.userId,
      action: "backup_restored",
      entityType: "band",
      entityId: bandId,
      payload: { restoredAt: new Date().toISOString() },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Backup konnte nicht wiederhergestellt werden.");
  }
}
