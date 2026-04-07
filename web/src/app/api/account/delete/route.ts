import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AuthError, requireAuthUser } from "@/lib/auth";

const schema = z.object({
  password: z.string().min(8).max(300),
});

export async function DELETE(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const payload = schema.parse(await request.json());

    const user = await prisma.appUser.findUnique({ where: { id: session.userId } });
    if (!user?.passwordHash) {
      throw new AuthError("Password verification is not available for this account.", 400);
    }

    const isValid = await bcrypt.compare(payload.password, user.passwordHash);
    if (!isValid) {
      throw new AuthError("Password confirmation failed.", 403);
    }

    await prisma.appUser.delete({
      where: { id: session.userId },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete account." },
      { status: 400 },
    );
  }
}
