import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuthUser, requireBandAction } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse } from "@/lib/http";

type Context = { params: Promise<{ bandId: string; recurringId: string }> };

async function ids(request: NextRequest, context: Context) {
  const session = await requireAuthUser(request);
  const params = await context.params;
  const bandId = parseUuid(params.bandId, "Band-ID");
  await requireBandAction(session.userId, bandId, "finance.manage");
  return { bandId, id: parseUuid(params.recurringId, "Dauerauftrags-ID") };
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const { bandId, id } = await ids(request, context);
    const { active } = z.object({ active: z.boolean() }).parse(await request.json());
    await prisma.recurringTransaction.updateMany({ where: { id, bandId }, data: { active } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    const { bandId, id } = await ids(request, context);
    await prisma.recurringTransaction.deleteMany({ where: { id, bandId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
