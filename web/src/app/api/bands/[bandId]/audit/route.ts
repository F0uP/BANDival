import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AuthError, requireAuthUser, requireBandMembership } from "@/lib/auth";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ bandId: string }> },
) {
  try {
    const session = await requireAuthUser(request);
    const { bandId } = await context.params;
    await requireBandMembership(session.userId, bandId);

    const parsed = querySchema.parse({
      limit: request.nextUrl.searchParams.get("limit") ?? undefined,
    });

    const logs = await prisma.auditLog.findMany({
      where: { bandId },
      orderBy: { createdAt: "desc" },
      take: parsed.limit,
      include: {
        actor: {
          select: {
            id: true,
            displayName: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json({ logs });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load audit log." },
      { status: 400 },
    );
  }
}
