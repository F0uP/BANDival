import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AuthError, requireAuthUser } from "@/lib/auth";

const schema = z.object({
  currentPassword: z.string().min(8).max(300),
  newPassword: z.string().min(10).max(300),
});

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const payload = schema.parse(await request.json());

    const user = await prisma.appUser.findUnique({ where: { id: session.userId } });
    if (!user?.passwordHash) {
      throw new AuthError("Password login is not configured for this account.", 400);
    }

    const isValid = await bcrypt.compare(payload.currentPassword, user.passwordHash);
    if (!isValid) {
      throw new AuthError("Current password is incorrect.", 403);
    }

    const nextHash = await bcrypt.hash(payload.newPassword, 12);
    await prisma.appUser.update({
      where: { id: session.userId },
      data: { passwordHash: nextHash },
    });

    return NextResponse.json({ ok: true, message: "Password updated." });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update password." },
      { status: 400 },
    );
  }
}
