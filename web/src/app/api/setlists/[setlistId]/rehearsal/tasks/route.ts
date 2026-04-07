import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertSetlistAccess, AuthError, requireAuthUser, writeAuditLog } from "@/lib/auth";

const createSchema = z.object({
  title: z.string().min(1).max(240),
  songId: z.string().uuid().nullable().optional(),
  assigneeUserId: z.string().uuid().nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
});

const patchSchema = z.object({
  taskId: z.string().uuid(),
  title: z.string().min(1).max(240).optional(),
  isDone: z.boolean().optional(),
  assigneeUserId: z.string().uuid().nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
});

const deleteSchema = z.object({
  taskId: z.string().uuid(),
});

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ setlistId: string }> },
) {
  try {
    const session = await requireAuthUser(request);
    const { setlistId } = await context.params;
    await assertSetlistAccess(session.userId, setlistId);

    const tasks = await prisma.setlistRehearsalTask.findMany({
      where: { setlistId },
      include: {
        assignee: {
          select: {
            id: true,
            displayName: true,
            email: true,
          },
        },
      },
      orderBy: [{ isDone: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ tasks });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load rehearsal tasks." },
      { status: 400 },
    );
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ setlistId: string }> },
) {
  try {
    const session = await requireAuthUser(request);
    const { setlistId } = await context.params;
    await assertSetlistAccess(session.userId, setlistId);

    const payload = createSchema.parse(await request.json());

    const task = await prisma.setlistRehearsalTask.create({
      data: {
        setlistId,
        title: payload.title,
        songId: payload.songId ?? null,
        assigneeUserId: payload.assigneeUserId ?? null,
        dueAt: payload.dueAt ? new Date(payload.dueAt) : null,
        updatedByUserId: session.userId,
      },
      include: {
        assignee: {
          select: {
            id: true,
            displayName: true,
            email: true,
          },
        },
      },
    });

    const setlist = await prisma.setlist.findUnique({ where: { id: setlistId }, select: { bandId: true } });
    if (setlist) {
      await writeAuditLog({
        bandId: setlist.bandId,
        actorUserId: session.userId,
        action: "rehearsal_task_created",
        entityType: "setlist_rehearsal_task",
        entityId: task.id,
        payload: { title: task.title },
      });
    }

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create rehearsal task." },
      { status: 400 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ setlistId: string }> },
) {
  try {
    const session = await requireAuthUser(request);
    const { setlistId } = await context.params;
    await assertSetlistAccess(session.userId, setlistId);

    const payload = patchSchema.parse(await request.json());

    const task = await prisma.setlistRehearsalTask.update({
      where: { id: payload.taskId },
      data: {
        title: payload.title,
        isDone: payload.isDone,
        assigneeUserId: payload.assigneeUserId,
        dueAt: payload.dueAt === undefined ? undefined : payload.dueAt ? new Date(payload.dueAt) : null,
        updatedByUserId: session.userId,
      },
      include: {
        assignee: {
          select: {
            id: true,
            displayName: true,
            email: true,
          },
        },
      },
    });

    if (task.setlistId !== setlistId) {
      throw new AuthError("Task does not belong to this setlist.", 404);
    }

    const setlist = await prisma.setlist.findUnique({ where: { id: setlistId }, select: { bandId: true } });
    if (setlist) {
      await writeAuditLog({
        bandId: setlist.bandId,
        actorUserId: session.userId,
        action: "rehearsal_task_updated",
        entityType: "setlist_rehearsal_task",
        entityId: task.id,
        payload: { isDone: task.isDone },
      });
    }

    return NextResponse.json({ task });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update rehearsal task." },
      { status: 400 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ setlistId: string }> },
) {
  try {
    const session = await requireAuthUser(request);
    const { setlistId } = await context.params;
    await assertSetlistAccess(session.userId, setlistId);

    const parsed = deleteSchema.parse({
      taskId: request.nextUrl.searchParams.get("taskId") ?? "",
    });

    const task = await prisma.setlistRehearsalTask.findUnique({
      where: { id: parsed.taskId },
      select: { id: true, setlistId: true },
    });

    if (!task || task.setlistId !== setlistId) {
      throw new AuthError("Task not found.", 404);
    }

    await prisma.setlistRehearsalTask.delete({ where: { id: task.id } });

    return NextResponse.json({ ok: true, taskId: task.id });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete rehearsal task." },
      { status: 400 },
    );
  }
}
