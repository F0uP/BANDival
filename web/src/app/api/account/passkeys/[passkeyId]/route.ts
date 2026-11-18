import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AuthError, requireAuthUser } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse } from "@/lib/http";

type Context = { params: Promise<{ passkeyId: string }> };

async function own(request: NextRequest, context: Context) {
  const session = await requireAuthUser(request);
  const id = parseUuid((await context.params).passkeyId, "Passkey-ID");
  const passkey = await prisma.passkey.findFirst({ where: { id, userId: session.userId }, select: { id: true } });
  if (!passkey) throw new AuthError("Passkey nicht gefunden.", 404);
  return { session, id };
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const { id } = await own(request, context);
    const { name } = z.object({ name: z.string().trim().min(1).max(80) }).parse(await request.json());
    await prisma.passkey.update({ where: { id }, data: { name } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Removing the last sign-in method is refused (a passwordless account would lock itself out). */
export async function DELETE(request: NextRequest, context: Context) {
  try {
    const { session, id } = await own(request, context);
    const [count, user] = await Promise.all([
      prisma.passkey.count({ where: { userId: session.userId } }),
      prisma.appUser.findUnique({ where: { id: session.userId }, select: { passwordHash: true } }),
    ]);
    if (count <= 1 && !user?.passwordHash) {
      throw new AuthError("Das ist dein einziger Passkey und du hast kein Passwort – lege zuerst ein Passwort oder einen weiteren Passkey an.", 409);
    }
    await prisma.passkey.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
