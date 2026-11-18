import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuthUser, requireBandMembership } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse } from "@/lib/http";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  entityType: z.string().min(1).max(120).optional(),
  entityId: z.string().min(1).max(120).optional(),
  before: z.string().datetime().optional(),
});

export async function GET(request: NextRequest, context: { params: Promise<{ bandId: string }> }) {
  try {
    const session = await requireAuthUser(request);
    const bandId = parseUuid((await context.params).bandId, "Band-ID");
    await requireBandMembership(session.userId, bandId);

    const params = request.nextUrl.searchParams;
    const parsed = querySchema.parse({
      limit: params.get("limit") ?? undefined,
      entityType: params.get("entityType") ?? undefined,
      entityId: params.get("entityId") ?? undefined,
      before: params.get("before") ?? undefined,
    });

    const logs = await prisma.auditLog.findMany({
      where: {
        bandId,
        ...(parsed.entityType ? { entityType: parsed.entityType } : {}),
        ...(parsed.entityId ? { entityId: parsed.entityId } : {}),
        ...(parsed.before ? { createdAt: { lt: new Date(parsed.before) } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: parsed.limit,
      include: {
        actor: { select: { id: true, displayName: true, email: true, avatarUrl: true } },
      },
    });

    return NextResponse.json({ logs, hasMore: logs.length === parsed.limit });
  } catch (error) {
    return errorResponse(error);
  }
}
