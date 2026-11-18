import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AuthError, requireAuthUser, requireBandMembership, writeAuditLog } from "@/lib/auth";
import { parseBandId, parseUuid } from "@/lib/api";
import { errorResponse } from "@/lib/http";

const statusSchema = z.enum(["open", "in_progress", "done"]);

const createTaskSchema = z.object({
  bandId: z.string().uuid(),
  setlistId: z.string().uuid().optional(),
  songId: z.string().uuid().optional(),
  title: z.string().trim().min(1, "Bitte einen Titel angeben.").max(200),
});

const patchTaskSchema = z.object({
  taskId: z.string().uuid(),
  title: z.string().trim().min(1).max(200).optional(),
  status: statusSchema.optional(),
});

const taskInclude = {
  song: { select: { id: true, title: true } },
  setlist: { select: { id: true, name: true } },
  updatedBy: { select: { id: true, displayName: true } },
} as const;

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const params = request.nextUrl.searchParams;
    const bandId = parseBandId(params.get("bandId"));
    await requireBandMembership(session.userId, bandId);

    const setlistId = params.get("setlistId");
    const songId = params.get("songId");
    const status = params.get("status");

    const tasks = await prisma.kanbanTask.findMany({
      where: {
        bandId,
        ...(setlistId ? { setlistId: parseUuid(setlistId, "Setlist-ID") } : {}),
        ...(songId ? { songId: parseUuid(songId, "Song-ID") } : {}),
        ...(status === "active" ? { status: { not: "done" as const } } : status ? { status: statusSchema.parse(status) } : {}),
      },
      include: taskInclude,
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: 300,
    });

    return NextResponse.json({ tasks });
  } catch (error) {
    return errorResponse(error, "Aufgaben konnten nicht geladen werden.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const payload = createTaskSchema.parse(await request.json());
    await requireBandMembership(session.userId, payload.bandId);

    if (!payload.setlistId && !payload.songId) {
      throw new AuthError("Eine Aufgabe braucht einen Song oder eine Setlist.", 400);
    }
    if (payload.setlistId && !(await prisma.setlist.count({ where: { id: payload.setlistId, bandId: payload.bandId } }))) {
      throw new AuthError("Setlist gehört nicht zu dieser Band.", 400);
    }
    if (payload.songId && !(await prisma.song.count({ where: { id: payload.songId, bandId: payload.bandId } }))) {
      throw new AuthError("Song gehört nicht zu dieser Band.", 400);
    }

    const task = await prisma.kanbanTask.create({
      data: {
        bandId: payload.bandId,
        setlistId: payload.setlistId ?? null,
        songId: payload.songId ?? null,
        title: payload.title,
        status: "open",
        updatedByUserId: session.userId,
      },
      include: taskInclude,
    });

    await writeAuditLog({
      bandId: payload.bandId,
      actorUserId: session.userId,
      action: "task_created",
      entityType: "task",
      entityId: task.id,
      payload: { title: payload.title, songId: payload.songId ?? null, setlistId: payload.setlistId ?? null },
    });

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Aufgabe konnte nicht erstellt werden.");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const payload = patchTaskSchema.parse(await request.json());

    const existing = await prisma.kanbanTask.findUnique({ where: { id: payload.taskId } });
    if (!existing) {
      throw new AuthError("Aufgabe nicht gefunden.", 404);
    }
    await requireBandMembership(session.userId, existing.bandId);

    const task = await prisma.kanbanTask.update({
      where: { id: payload.taskId },
      data: { title: payload.title, status: payload.status, updatedByUserId: session.userId },
      include: taskInclude,
    });

    if (payload.status && payload.status !== existing.status) {
      await writeAuditLog({
        bandId: existing.bandId,
        actorUserId: session.userId,
        action: payload.status === "done" ? "task_done" : "task_updated",
        entityType: "task",
        entityId: task.id,
        payload: { title: task.title, status: payload.status, songId: task.songId, setlistId: task.setlistId },
      });
    }

    return NextResponse.json({ task });
  } catch (error) {
    return errorResponse(error, "Aufgabe konnte nicht aktualisiert werden.");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const taskId = parseUuid(request.nextUrl.searchParams.get("taskId"), "Aufgaben-ID");

    const existing = await prisma.kanbanTask.findUnique({ where: { id: taskId } });
    if (!existing) {
      throw new AuthError("Aufgabe nicht gefunden.", 404);
    }
    await requireBandMembership(session.userId, existing.bandId);
    await prisma.kanbanTask.delete({ where: { id: taskId } });

    return NextResponse.json({ ok: true, taskId });
  } catch (error) {
    return errorResponse(error, "Aufgabe konnte nicht gelöscht werden.");
  }
}
