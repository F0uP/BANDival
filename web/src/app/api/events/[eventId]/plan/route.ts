import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AuthError, assertEventAccess, assertSongsInBand, requireAuthUser, requireBandAction, writeAuditLog } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse } from "@/lib/http";

type Context = { params: Promise<{ eventId: string }> };

/**
 * Rehearsal planner: suggests what to practise – songs of the next gig, songs still in progress,
 * songs that went badly last time and songs not played for a long time – and fills the rehearsal length.
 */
export async function GET(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const eventId = parseUuid((await context.params).eventId, "Termin-ID");
    const { bandId } = await assertEventAccess(session.userId, eventId);
    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new AuthError("Termin nicht gefunden.", 404);
    const horizon = new Date(event.startsAt.getTime() + 45 * 86_400_000);

    const [songs, gigs, history, tasks] = await Promise.all([
      prisma.song.findMany({ where: { bandId, workflowStatus: { not: "archived" } }, select: { id: true, title: true, workflowStatus: true, durationSeconds: true, keySignature: true } }),
      prisma.event.findMany({
        where: { bandId, kind: "gig", status: { not: "cancelled" }, startsAt: { gt: event.startsAt, lt: horizon }, setlistId: { not: null } },
        orderBy: { startsAt: "asc" },
        select: { title: true, startsAt: true, setlist: { select: { items: { select: { songId: true } } } } },
      }),
      prisma.eventLogSong.findMany({
        where: { event: { bandId, startsAt: { lt: event.startsAt } } },
        select: { songId: true, rating: true, event: { select: { startsAt: true } } },
        orderBy: { event: { startsAt: "desc" } },
      }),
      prisma.kanbanTask.groupBy({ by: ["songId"], where: { bandId, status: { not: "done" }, songId: { not: null } }, _count: { _all: true } }),
    ]);

    const lastPlayed = new Map<string, { date: Date; rating: number | null }>();
    for (const entry of history) if (!lastPlayed.has(entry.songId)) lastPlayed.set(entry.songId, { date: entry.event.startsAt, rating: entry.rating });
    const openTasks = new Map(tasks.map((entry) => [entry.songId!, entry._count._all]));

    const suggestions = songs.map((song) => {
      let score = 0;
      const reasons: string[] = [];
      for (const gig of gigs) {
        if (gig.setlist?.items.some((item) => item.songId === song.id)) {
          const days = Math.round((gig.startsAt.getTime() - event.startsAt.getTime()) / 86_400_000);
          score += 40 + Math.max(0, 30 - days);
          reasons.push(`im Set für „${gig.title}“ in ${days} Tagen`);
          break;
        }
      }
      if (song.workflowStatus === "review") { score += 25; reasons.push("in Arbeit"); }
      if (song.workflowStatus === "draft") { score += 15; reasons.push("neu"); }
      const last = lastPlayed.get(song.id);
      if (!last) {
        score += 12;
        reasons.push("noch nie geprobt");
      } else {
        const days = Math.round((event.startsAt.getTime() - last.date.getTime()) / 86_400_000);
        if (last.rating !== null && last.rating <= 2) { score += 22; reasons.push("lief zuletzt holprig"); }
        else if (last.rating === 3) { score += 10; reasons.push("zuletzt mittelmäßig"); }
        else if (last.rating !== null && last.rating >= 4) score -= 6;
        if (days > 30) { score += 10; reasons.push(`seit ${days} Tagen nicht gespielt`); }
        else if (days < 7) score -= 10;
      }
      const taskCount = openTasks.get(song.id) ?? 0;
      if (taskCount) { score += Math.min(15, taskCount * 5); reasons.push(`${taskCount} offene Aufgabe${taskCount === 1 ? "" : "n"}`); }
      return { song, score, reasons };
    }).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score);

    // Fill the rehearsal: every song roughly twice plus a few minutes of talking/fixing.
    const lengthMinutes = event.endsAt ? Math.round((event.endsAt.getTime() - event.startsAt.getTime()) / 60_000) : 120;
    let used = 0;
    const plan = [];
    for (const entry of suggestions) {
      const minutes = Math.ceil(((entry.song.durationSeconds ?? 240) * 2) / 60) + 3;
      if (used + minutes > lengthMinutes && plan.length >= 3) continue;
      used += minutes;
      plan.push({ ...entry, minutes });
      if (used >= lengthMinutes) break;
    }
    return NextResponse.json({ lengthMinutes, plannedMinutes: used, plan, more: suggestions.length - plan.length });
  } catch (error) {
    return errorResponse(error, "Probenplan konnte nicht erstellt werden.");
  }
}

const createSchema = z.object({ songIds: z.array(z.string().uuid()).min(1).max(60) });

/** Saves the plan as a setlist and links it to the rehearsal. */
export async function POST(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const eventId = parseUuid((await context.params).eventId, "Termin-ID");
    const { bandId } = await assertEventAccess(session.userId, eventId);
    await requireBandAction(session.userId, bandId, "setlists.create");
    const { songIds } = createSchema.parse(await request.json());
    await assertSongsInBand(bandId, songIds);
    const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { title: true, startsAt: true, setlistId: true } });
    const band = await prisma.band.findUniqueOrThrow({ where: { id: bandId }, select: { timezone: true } });
    const label = event.startsAt.toLocaleDateString("de-DE", { timeZone: band.timezone, day: "2-digit", month: "2-digit" });
    const setlist = await prisma.setlist.create({
      data: { bandId, name: `Probenplan ${label}`, items: { create: songIds.map((songId, position) => ({ songId, position: position + 1 })) } },
      select: { id: true },
    });
    if (!event.setlistId) await prisma.event.update({ where: { id: eventId }, data: { setlistId: setlist.id } });
    await writeAuditLog({ bandId, actorUserId: session.userId, action: "setlist_created", entityType: "setlist", entityId: setlist.id, payload: { name: `Probenplan ${label}` } });
    return NextResponse.json({ setlistId: setlist.id }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Probenplan konnte nicht gespeichert werden.");
  }
}
