import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuthUser, requireBandAction } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse } from "@/lib/http";

const schema = z.object({
  amountCents: z.number().int().min(-100_000_000).max(100_000_000).refine((value) => value !== 0, "Betrag darf nicht 0 sein."),
  category: z.string().trim().min(1).max(60),
  description: z.string().trim().min(1).max(300),
  dayOfMonth: z.number().int().min(1).max(31),
});

/** Standing orders (e.g. rehearsal room rent) – booked monthly by the scheduler. */
export async function POST(request: NextRequest, context: { params: Promise<{ bandId: string }> }) {
  try {
    const session = await requireAuthUser(request);
    const bandId = parseUuid((await context.params).bandId, "Band-ID");
    await requireBandAction(session.userId, bandId, "finance.manage");
    const payload = schema.parse(await request.json());
    const recurring = await prisma.recurringTransaction.create({ data: { bandId, ...payload } });
    return NextResponse.json({ recurring }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Dauerauftrag konnte nicht angelegt werden.");
  }
}
