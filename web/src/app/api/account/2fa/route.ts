import bcrypt from "bcryptjs";
import { openSecret, sealSecret } from "@/lib/secret-box";
import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AuthError, requireAuthUser } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { generateRecoveryCodes, generateTotpSecret, hashRecoveryCode, otpauthUrl, verifyTotp } from "@/lib/totp";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("setup") }),
  z.object({ action: z.literal("enable"), code: z.string().trim().min(6).max(8) }),
  z.object({ action: z.literal("disable"), password: z.string().min(1).max(300) }),
  z.object({ action: z.literal("recovery-codes"), password: z.string().min(1).max(300) }),
]);

async function issueRecoveryCodes(userId: string): Promise<string[]> {
  const codes = generateRecoveryCodes();
  await prisma.$transaction([
    prisma.twoFactorRecoveryCode.deleteMany({ where: { userId } }),
    prisma.twoFactorRecoveryCode.createMany({ data: codes.map((code) => ({ userId, codeHash: hashRecoveryCode(code) })) }),
  ]);
  return codes;
}

async function checkPassword(userId: string, password: string) {
  const user = await prisma.appUser.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  // Passkey-only accounts have no password to confirm – the (passkey-backed) session is the proof.
  if (user && !user.passwordHash) return;
  if (!user?.passwordHash || !(await bcrypt.compare(password ?? "", user.passwordHash))) {
    throw new AuthError("Passwort ist falsch.", 403);
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const user = await prisma.appUser.findUnique({
      where: { id: session.userId },
      select: { totpEnabledAt: true, _count: { select: { recoveryCodes: { where: { usedAt: null } } } } },
    });
    return NextResponse.json({ enabled: Boolean(user?.totpEnabledAt), remainingRecoveryCodes: user?._count.recoveryCodes ?? 0 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const payload = actionSchema.parse(await request.json());
    const user = await prisma.appUser.findUnique({ where: { id: session.userId } });
    if (!user) throw new AuthError("Nicht angemeldet.", 401);

    if (payload.action === "setup") {
      if (user.totpEnabledAt) throw new AuthError("Zwei-Faktor-Anmeldung ist bereits aktiv.", 409);
      const secret = generateTotpSecret();
      await prisma.appUser.update({ where: { id: user.id }, data: { totpSecret: sealSecret(secret), totpLastStep: null } });
      const url = otpauthUrl(secret, user.email);
      const svg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
      return NextResponse.json({ secret, otpauthUrl: url, qrSvg: svg });
    }

    if (payload.action === "enable") {
      const secret = openSecret(user.totpSecret);
      if (!secret) throw new AuthError("Bitte zuerst die Einrichtung starten.", 400);
      if (!verifyTotp(secret, payload.code)) throw new AuthError("Der Code stimmt nicht. Prüfe die Uhrzeit deines Handys.", 400);
      await prisma.appUser.update({ where: { id: user.id }, data: { totpEnabledAt: new Date() } });
      return NextResponse.json({ ok: true, recoveryCodes: await issueRecoveryCodes(user.id) });
    }

    await checkPassword(user.id, payload.password);

    if (payload.action === "recovery-codes") {
      if (!user.totpEnabledAt) throw new AuthError("Zwei-Faktor-Anmeldung ist nicht aktiv.", 400);
      return NextResponse.json({ ok: true, recoveryCodes: await issueRecoveryCodes(user.id) });
    }

    await prisma.$transaction([
      prisma.appUser.update({ where: { id: user.id }, data: { totpEnabledAt: null, totpSecret: null, totpLastStep: null } }),
      prisma.twoFactorRecoveryCode.deleteMany({ where: { userId: user.id } }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Zwei-Faktor-Einstellung fehlgeschlagen.");
  }
}
