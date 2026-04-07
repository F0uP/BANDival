import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AuthError, requireAuthUser, requireBandRole } from "@/lib/auth";

const schema = z.object({
  bandId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const payload = schema.parse(await request.json());
    await requireBandRole(session.userId, payload.bandId, ["owner", "admin", "member"]);

    await prisma.bandMember.deleteMany({
      where: {
        userId: session.userId,
        bandId: payload.bandId,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to leave band." },
      { status: 400 },
    );
  }
}
