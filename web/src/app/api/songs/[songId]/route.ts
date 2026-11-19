import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { AuthError, assertSongAccess, getBandRole, requireAuthUser, writeAuditLog } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse, json } from "@/lib/http";
import { roleCan } from "@/lib/permissions";
import { deleteUploadDirectory } from "@/lib/storage";
import { songInputSchema } from "@/lib/schemas";
import { z } from "zod";
import { conflictBody, currentRevision, saveDocument, type SaveOutcome } from "@/lib/merge/server";

type Context = { params: Promise<{ songId: string }> };

const authorSelect = { select: { id: true, displayName: true, email: true, avatarUrl: true } } as const;

const updateSongSchema = songInputSchema.partial().extend({
  /** Revision the client started from – enables the three-way merge with changes of others. */
  baseRevision: z.number().int().positive().nullable().optional(),
});

export async function GET(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const songId = parseUuid((await context.params).songId, "Song-ID");
    const { bandId } = await assertSongAccess(session.userId, songId, { allowGuest: true });
    const isGuest = (await getBandRole(session.userId, bandId)) === "guest";

    const song = await prisma.song.findUnique({
      where: { id: songId },
      include: {
        album: { select: { id: true, title: true, coverUrl: true } },
        creator: { select: { id: true, displayName: true } },
        audioVersions: { orderBy: { versionNumber: "desc" } },
        attachments: { orderBy: { createdAt: "desc" } },
        lyricsRevisions: { where: { isCurrent: true }, take: 1 },
        threads: {
          orderBy: { updatedAt: "desc" },
          include: {
            createdBy: authorSelect,
            posts: { orderBy: { createdAt: "asc" }, include: { createdBy: authorSelect } },
          },
        },
        setlistItems: {
          where: isGuest ? { setlist: { guestAccess: { some: { member: { userId: session.userId } } } } } : undefined,
          select: { setlist: { select: { id: true, name: true } } },
        },
        _count: { select: { lyricsRevisions: true } },
      },
    });

    if (!song) {
      throw new AuthError("Song nicht gefunden.", 404);
    }

    const revision = await currentRevision("song", songId);
    // Guests (session musicians) see the material, not the band-internal discussion.
    return json({ song: { ...(isGuest ? { ...song, threads: [] } : song), revision } });
  } catch (error) {
    return errorResponse(error, "Song konnte nicht geladen werden.");
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const songId = parseUuid((await context.params).songId, "Song-ID");
    const { bandId } = await assertSongAccess(session.userId, songId);
    const payload = updateSongSchema.parse(await request.json());

    if (payload.albumId) {
      const album = await prisma.album.findFirst({ where: { id: payload.albumId, bandId }, select: { id: true } });
      if (!album) {
        throw new AuthError("Album gehört nicht zu dieser Band.", 400);
      }
    }

    const before = await prisma.song.findUnique({
      where: { id: songId },
      select: { title: true, workflowStatus: true, keySignature: true, tempoBpm: true, durationSeconds: true, albumId: true },
    });

    // Song fields and lead sheet are merged git-like with changes others made since `baseRevision`.
    const changes: Record<string, unknown> = {};
    if (payload.title !== undefined) changes.title = payload.title;
    if (payload.workflowStatus !== undefined) changes.workflowStatus = payload.workflowStatus;
    if (payload.keySignature !== undefined) changes.keySignature = payload.keySignature || null;
    if (payload.tempoBpm !== undefined) changes.tempoBpm = payload.tempoBpm;
    if (payload.durationSeconds !== undefined) changes.durationSeconds = payload.durationSeconds;
    if (payload.timeSignature !== undefined) changes.timeSignature = payload.timeSignature || null;
    if (payload.isPublic !== undefined) changes.isPublic = payload.isPublic;
    if (payload.spotifyUrl !== undefined) changes.spotifyUrl = payload.spotifyUrl || null;
    if (payload.notes !== undefined) changes.notes = payload.notes || null;
    if (payload.chordProText !== undefined) changes.chordProText = payload.chordProText || null;
    for (const field of ["composers", "lyricists", "publisher", "gemaWorkNumber"] as const) {
      if (payload[field] !== undefined) changes[field] = payload[field] || null;
    }
    let merge: SaveOutcome | null = null;
    if (Object.keys(changes).length > 0) {
      merge = await saveDocument({ docType: "song", docId: songId, userId: session.userId, baseRevision: payload.baseRevision, mutate: (state) => ({ ...state, ...changes }) });
      if (merge.status === "conflict") return NextResponse.json(conflictBody(merge), { status: 409 });
    }

    const song = await prisma.$transaction(async (tx) => {
      if (payload.lyricsMarkdown !== undefined) {
        const current = await tx.songLyricsRevision.findFirst({
          where: { songId, isCurrent: true },
          orderBy: { revisionNumber: "desc" },
        });
        const nextLyrics = payload.lyricsMarkdown ?? "";
        if ((current?.lyricsMarkdown ?? "") !== nextLyrics) {
          const latest = await tx.songLyricsRevision.findFirst({ where: { songId }, orderBy: { revisionNumber: "desc" } });
          if (current) {
            await tx.songLyricsRevision.update({ where: { id: current.id }, data: { isCurrent: false } });
          }
          const revisionNumber = (latest?.revisionNumber ?? 0) + 1;
          await tx.songLyricsRevision.create({
            data: { songId, revisionNumber, title: `Revision ${revisionNumber}`, lyricsMarkdown: nextLyrics, isCurrent: true },
          });
        }
      }

      return tx.song.update({
        where: { id: songId },
        data: {
          albumId: payload.albumId,
          albumTrackNo: payload.albumId === null ? null : payload.albumTrackNo,
        },
        select: { id: true, title: true, workflowStatus: true, updatedAt: true },
      });
    });

    const changedFields = Object.keys(payload).filter((key) => key !== "lyricsMarkdown" && key !== "chordProText" && key !== "notes" && key !== "baseRevision");
    await writeAuditLog({
      bandId,
      actorUserId: session.userId,
      action: payload.workflowStatus && before?.workflowStatus !== payload.workflowStatus ? "song_status_changed" : "song_updated",
      entityType: "song",
      entityId: songId,
      payload: {
        songId,
        title: song.title,
        fields: [...changedFields, ...(payload.lyricsMarkdown !== undefined || payload.chordProText !== undefined ? ["leadsheet"] : [])],
        ...(payload.workflowStatus ? { from: before?.workflowStatus, to: payload.workflowStatus } : {}),
      } as Prisma.InputJsonValue,
    });

    return json({
      song,
      revision: merge?.revision ?? await currentRevision("song", songId),
      merge: merge ? { status: merge.status } : null,
    });
  } catch (error) {
    return errorResponse(error, "Song konnte nicht gespeichert werden.");
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const songId = parseUuid((await context.params).songId, "Song-ID");
    const { bandId } = await assertSongAccess(session.userId, songId);

    const existing = await prisma.song.findUnique({ where: { id: songId }, select: { id: true, title: true, createdBy: true } });
    if (!existing) {
      throw new AuthError("Song nicht gefunden.", 404);
    }

    const role = await getBandRole(session.userId, bandId);
    if (!roleCan(role, "songs.delete") && existing.createdBy !== session.userId) {
      throw new AuthError("Nur Admins oder die Person, die den Song angelegt hat, können ihn löschen.", 403);
    }

    // Setlist items restrict song deletion – remove the song from all setlists first.
    await prisma.$transaction([
      prisma.setlistItem.deleteMany({ where: { songId } }),
      prisma.song.delete({ where: { id: songId } }),
    ]);

    await Promise.all([deleteUploadDirectory("audio", songId), deleteUploadDirectory("songs", songId)]);

    await writeAuditLog({
      bandId,
      actorUserId: session.userId,
      action: "song_deleted",
      entityType: "song",
      entityId: existing.id,
      payload: { title: existing.title },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Song konnte nicht gelöscht werden.");
  }
}
