import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AuthError, assertSetlistAccess, assertSongAccess, requireAuthUser, requireBandMembership, writeAuditLog } from "@/lib/auth";
import { parseBandId } from "@/lib/api";

const statusSchema = z.enum(["open", "in_progress", "done"]);

const createTaskSchema = z.object({
  bandId: z.string().uuid(),
  setlistId: z.string().uuid().optional(),
  songId: z.string().uuid().optional(),
  title: z.string().min(1).max(200),
});

const patchTaskSchema = z.object({
  taskId: z.string().uuid(),
  title: z.string().min(1).max(200).optional(),
  status: statusSchema.optional(),
});

function isUuid(value: string | null): value is string {
  return typeof value === "string" && value.length === 36;
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const bandId = parseBandId(request.nextUrl.searchParams.get("bandId"));
    const setlistId = request.nextUrl.searchParams.get("setlistId");
    const songId = request.nextUrl.searchParams.get("songId");

    await requireBandMembership(session.userId, bandId);

    if (isUuid(setlistId)) {
      await assertSetlistAccess(session.userId, setlistId);
    }

    if (isUuid(songId)) {
      await assertSongAccess(session.userId, songId);
    }

    const tasks = await prisma.kanbanTask.findMany({
      where: {
        bandId,
        ...(isUuid(setlistId) ? { setlistId } : {}),
        ...(isUuid(songId) ? { songId } : {}),
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ tasks });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load board tasks." }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const payload = createTaskSchema.parse(await request.json());
    await requireBandMembership(session.userId, payload.bandId);

    if (payload.setlistId) {
      await assertSetlistAccess(session.userId, payload.setlistId);
    }

    if (payload.songId) {
      await assertSongAccess(session.userId, payload.songId);
    }

    if (!payload.setlistId && !payload.songId) {
      throw new AuthError("Either setlistId or songId is required.", 400);
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
    });

    await writeAuditLog({
      bandId: payload.bandId,
      actorUserId: session.userId,
      action: "kanban_task_created",
      entityType: "kanban_task",
      entityId: task.id,
      payload: { setlistId: payload.setlistId ?? null, songId: payload.songId ?? null, title: payload.title },
    });

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create board task." }, { status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const payload = patchTaskSchema.parse(await request.json());

    const existing = await prisma.kanbanTask.findUnique({ where: { id: payload.taskId } });
    if (!existing) {
      throw new AuthError("Task not found.", 404);
    }

    await requireBandMembership(session.userId, existing.bandId);

    const task = await prisma.kanbanTask.update({
      where: { id: payload.taskId },
      data: {
        title: payload.title,
        status: payload.status,
        updatedByUserId: session.userId,
      },
    });

    await writeAuditLog({
      bandId: existing.bandId,
      actorUserId: session.userId,
      action: "kanban_task_updated",
      entityType: "kanban_task",
      entityId: task.id,
      payload: { status: payload.status ?? null, title: payload.title ?? null },
    });

    return NextResponse.json({ task });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update board task." }, { status });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const taskId = request.nextUrl.searchParams.get("taskId");
    if (!isUuid(taskId)) {
      throw new AuthError("taskId is required.", 400);
    }

    const existing = await prisma.kanbanTask.findUnique({ where: { id: taskId } });
    if (!existing) {
      throw new AuthError("Task not found.", 404);
    }

    await requireBandMembership(session.userId, existing.bandId);
    await prisma.kanbanTask.delete({ where: { id: taskId } });

    await writeAuditLog({
      bandId: existing.bandId,
      actorUserId: session.userId,
      action: "kanban_task_deleted",
      entityType: "kanban_task",
      entityId: taskId,
      payload: { setlistId: existing.setlistId, songId: existing.songId },
    });

    return NextResponse.json({ ok: true, taskId });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to delete board task." }, { status });
  }
}
