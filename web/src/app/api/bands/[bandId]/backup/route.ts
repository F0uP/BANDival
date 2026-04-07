import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthError, requireAuthUser, requireBandAction, writeAuditLog } from "@/lib/auth";

type BackupPayload = {
  band: { id: string; name: string; slug: string; description: string | null };
  albums: unknown[];
  songs: unknown[];
  lyricsRevisions: unknown[];
  audioVersions: unknown[];
  attachments: unknown[];
  threads: unknown[];
  posts: unknown[];
  setlists: unknown[];
  setlistItems: unknown[];
  rehearsalNotes: unknown[];
  rehearsalTasks: unknown[];
  events: unknown[];
  availabilities: unknown[];
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ bandId: string }> },
) {
  try {
    const session = await requireAuthUser(request);
    const { bandId } = await context.params;
    await requireBandAction(session.userId, bandId, "backup.export");

    const band = await prisma.band.findUnique({
      where: { id: bandId },
      select: { id: true, name: true, slug: true, description: true },
    });

    if (!band) {
      throw new AuthError("Band not found.", 404);
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
      prisma.event.findMany({ where: { bandId } }),
      prisma.eventAvailability.findMany({ where: { event: { bandId } } }),
    ]);

    const snapshot = {
      exportedAt: new Date().toISOString(),
      version: 1,
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
        events,
        availabilities,
      },
    };

    return NextResponse.json(snapshot);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to export backup." },
      { status: 400 },
    );
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ bandId: string }> },
) {
  try {
    const session = await requireAuthUser(request);
    const { bandId } = await context.params;
    await requireBandAction(session.userId, bandId, "backup.restore");

    const payload = (await request.json()) as { data?: BackupPayload };
    if (!payload?.data || payload.data.band.id !== bandId) {
      throw new AuthError("Invalid backup payload for this band.", 400);
    }
    const snapshot = payload.data;

    await prisma.$transaction(async (tx) => {
      await tx.discussionPost.deleteMany({ where: { thread: { song: { bandId } } } });
      await tx.discussionThread.deleteMany({ where: { song: { bandId } } });
      await tx.songAudioVersion.deleteMany({ where: { song: { bandId } } });
      await tx.songAttachment.deleteMany({ where: { song: { bandId } } });
      await tx.songLyricsRevision.deleteMany({ where: { song: { bandId } } });
      await tx.setlistRehearsalTask.deleteMany({ where: { setlist: { bandId } } });
      await tx.setlistRehearsalNote.deleteMany({ where: { setlist: { bandId } } });
      await tx.setlistItem.deleteMany({ where: { setlist: { bandId } } });
      await tx.eventAvailability.deleteMany({ where: { event: { bandId } } });
      await tx.setlist.deleteMany({ where: { bandId } });
      await tx.event.deleteMany({ where: { bandId } });
      await tx.song.deleteMany({ where: { bandId } });
      await tx.album.deleteMany({ where: { bandId } });

      await tx.album.createMany({ data: snapshot.albums as never[], skipDuplicates: true });
      await tx.song.createMany({ data: snapshot.songs as never[], skipDuplicates: true });
      await tx.songLyricsRevision.createMany({ data: snapshot.lyricsRevisions as never[], skipDuplicates: true });
      await tx.songAudioVersion.createMany({ data: snapshot.audioVersions as never[], skipDuplicates: true });
      await tx.songAttachment.createMany({ data: snapshot.attachments as never[], skipDuplicates: true });
      await tx.discussionThread.createMany({ data: snapshot.threads as never[], skipDuplicates: true });
      await tx.discussionPost.createMany({ data: snapshot.posts as never[], skipDuplicates: true });
      await tx.setlist.createMany({ data: snapshot.setlists as never[], skipDuplicates: true });
      await tx.setlistItem.createMany({ data: snapshot.setlistItems as never[], skipDuplicates: true });
      await tx.setlistRehearsalNote.createMany({ data: snapshot.rehearsalNotes as never[], skipDuplicates: true });
      await tx.setlistRehearsalTask.createMany({ data: snapshot.rehearsalTasks as never[], skipDuplicates: true });
      await tx.event.createMany({ data: snapshot.events as never[], skipDuplicates: true });
      await tx.eventAvailability.createMany({ data: snapshot.availabilities as never[], skipDuplicates: true });
    });

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
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to restore backup." },
      { status: 400 },
    );
  }
}
