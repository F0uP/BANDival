import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AuthError, clearCsrfCookie, clearSessionCookie, requireAuthUser } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { deleteUploadDirectory } from "@/lib/storage";

const schema = z.object({
  password: z.string().min(1).max(300),
});

export async function DELETE(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const payload = schema.parse(await request.json());

    const user = await prisma.appUser.findUnique({ where: { id: session.userId } });
    if (!user) throw new AuthError("Nicht angemeldet.", 401);
    // Passkey-only accounts confirm with their e-mail address instead of a password.
    const isValid = user.passwordHash
      ? await bcrypt.compare(payload.password, user.passwordHash)
      : payload.password.trim().toLowerCase() === user.email.toLowerCase();
    if (!isValid) {
      throw new AuthError(user.passwordHash ? "Passwort ist falsch." : "Bitte zur Bestätigung deine E-Mail-Adresse eingeben.", 403);
    }

    // Bands where the user is the last owner but other members remain would be orphaned.
    const ownerships = await prisma.bandMember.findMany({
      where: { userId: session.userId, role: "owner" },
      select: { bandId: true, band: { select: { name: true, _count: { select: { members: true } } } } },
    });
    const blocking: string[] = [];
    const soloBands: string[] = [];
    for (const ownership of ownerships) {
      const owners = await prisma.bandMember.count({ where: { bandId: ownership.bandId, role: "owner" } });
      if (ownership.band._count.members <= 1) {
        soloBands.push(ownership.bandId);
      } else if (owners <= 1) {
        blocking.push(ownership.band.name);
      }
    }
    if (blocking.length > 0) {
      throw new AuthError(`Bitte übertrage zuerst die Owner-Rolle in: ${blocking.join(", ")}.`, 409);
    }

    await prisma.$transaction(async (tx) => {
      if (soloBands.length > 0) {
        // Setlist items restrict song deletion – remove them before the band cascade.
        await tx.setlistItem.deleteMany({ where: { setlist: { bandId: { in: soloBands } } } });
        await tx.band.deleteMany({ where: { id: { in: soloBands } } });
      }
      await tx.appUser.delete({ where: { id: session.userId } });
    });

    await deleteUploadDirectory("avatars", session.userId);

    const response = NextResponse.json({ ok: true });
    clearSessionCookie(response);
    clearCsrfCookie(response);
    return response;
  } catch (error) {
    return errorResponse(error, "Account konnte nicht gelöscht werden.");
  }
}
