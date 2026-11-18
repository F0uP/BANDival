import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AuthError, assertSetlistAccess, requireAuthUser, writeAuditLog } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse } from "@/lib/http";

const createSchema = z.object({
  title: z.string().trim().min(1).max(240),
  songId: z.string().uuid().nullable().optional(),
  assigneeUserId: z.string().uuid().nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
});

const patchSchema = z.object({
  taskId: z.string().uuid(),
  title: z.string().trim().min(1).max(240).optional(),
  isDone: z.boolean().optional(),
  assigneeUserId: z.string().uuid().nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
});

type Context = { params: Promise<{ setlistId: string }> };

const assigneeInclude = { assignee: { select: { id: true, displayName: true, email: true } } } as const;

async function assertAssigneeInBand(bandId: string, userId: string | null | undefined) {
  if (!userId) {
    return;
  }
  const member = await prisma.bandMember.findUnique({ where: { bandId_userId: { bandId, userId } }, select: { id: true } });
  if (!member) {
    throw new AuthError("Die zugewiesene Person ist kein Bandmitglied.", 400);
  }
}

export async function GET(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const setlistId = parseUuid((await context.params).setlistId, "Setlist-ID");
    await assertSetlistAccess(session.userId, setlistId);

    const tasks = await prisma.setlistRehearsalTask.findMany({
      where: { setlistId },
      include: assigneeInclude,
      orderBy: [{ isDone: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ tasks });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const setlistId = parseUuid((await context.params).setlistId, "Setlist-ID");
    const { bandId } = await assertSetlistAccess(session.userId, setlistId);
    const payload = createSchema.parse(await request.json());
    await assertAssigneeInBand(bandId, payload.assigneeUserId);

    const task = await prisma.setlistRehearsalTask.create({
      data: {
        setlistId,
        title: payload.title,
        songId: payload.songId ?? null,
        assigneeUserId: payload.assigneeUserId ?? null,
        dueAt: payload.dueAt ? new Date(payload.dueAt) : null,
        updatedByUserId: session.userId,
      },
      include: assigneeInclude,
    });

    await writeAuditLog({
      bandId,
      actorUserId: session.userId,
      action: "rehearsal_task_created",
      entityType: "setlist",
      entityId: setlistId,
      payload: { title: task.title },
    });

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const setlistId = parseUuid((await context.params).setlistId, "Setlist-ID");
    const { bandId } = await assertSetlistAccess(session.userId, setlistId);
    const payload = patchSchema.parse(await request.json());

    const existing = await prisma.setlistRehearsalTask.findFirst({ where: { id: payload.taskId, setlistId }, select: { id: true } });
    if (!existing) {
      throw new AuthError("Aufgabe nicht gefunden.", 404);
    }
    await assertAssigneeInBand(bandId, payload.assigneeUserId);

    const task = await prisma.setlistRehearsalTask.update({
      where: { id: existing.id },
      data: {
        title: payload.title,
        isDone: payload.isDone,
        assigneeUserId: payload.assigneeUserId,
        dueAt: payload.dueAt === undefined ? undefined : payload.dueAt ? new Date(payload.dueAt) : null,
        updatedByUserId: session.userId,
      },
      include: assigneeInclude,
    });

    return NextResponse.json({ task });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const setlistId = parseUuid((await context.params).setlistId, "Setlist-ID");
    await assertSetlistAccess(session.userId, setlistId);
    const taskId = parseUuid(request.nextUrl.searchParams.get("taskId"), "Aufgaben-ID");

    const task = await prisma.setlistRehearsalTask.findFirst({ where: { id: taskId, setlistId }, select: { id: true } });
    if (!task) {
      throw new AuthError("Aufgabe nicht gefunden.", 404);
    }

    await prisma.setlistRehearsalTask.delete({ where: { id: task.id } });
    return NextResponse.json({ ok: true, taskId: task.id });
  } catch (error) {
    return errorResponse(error);
  }
}
