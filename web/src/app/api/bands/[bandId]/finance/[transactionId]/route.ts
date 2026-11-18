import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AuthError, requireAuthUser, requireBandAction } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse } from "@/lib/http";

type Context = { params: Promise<{ bandId: string; transactionId: string }> };

const patchSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  amountCents: z.number().int().min(-100_000_000).max(100_000_000).optional(),
  category: z.string().trim().min(1).max(60).optional(),
  description: z.string().trim().min(1).max(300).optional(),
});

async function load(request: NextRequest, context: Context) {
  const session = await requireAuthUser(request);
  const params = await context.params;
  const bandId = parseUuid(params.bandId, "Band-ID");
  const id = parseUuid(params.transactionId, "Buchungs-ID");
  await requireBandAction(session.userId, bandId, "finance.manage");
  const transaction = await prisma.financeTransaction.findFirst({ where: { id, bandId } });
  if (!transaction) throw new AuthError("Buchung nicht gefunden.", 404);
  return transaction;
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const transaction = await load(request, context);
    const payload = patchSchema.parse(await request.json());
    await prisma.financeTransaction.update({
      where: { id: transaction.id },
      data: { ...payload, date: payload.date ? new Date(`${payload.date}T00:00:00Z`) : undefined },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    const transaction = await load(request, context);
    await prisma.financeTransaction.delete({ where: { id: transaction.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
