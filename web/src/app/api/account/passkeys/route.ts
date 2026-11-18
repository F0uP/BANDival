import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { prisma } from "@/lib/prisma";
import { AuthError, requireAuthUser } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { consumeChallenge, passkeyName, registrationOptions, storePasskey, verifyRegistration } from "@/lib/passkeys";

const schema = z.discriminatedUnion("step", [
  z.object({ step: z.literal("options") }),
  z.object({ step: z.literal("verify"), challengeId: z.string().uuid(), response: z.record(z.string(), z.unknown()), name: z.string().trim().max(80).optional() }),
]);

const select = { id: true, name: true, deviceType: true, backedUp: true, createdAt: true, lastUsedAt: true } as const;

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const [passkeys, user] = await Promise.all([
      prisma.passkey.findMany({ where: { userId: session.userId }, orderBy: { createdAt: "asc" }, select }),
      prisma.appUser.findUnique({ where: { id: session.userId }, select: { passwordHash: true } }),
    ]);
    return NextResponse.json({ passkeys, hasPassword: Boolean(user?.passwordHash) });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Adds a passkey to the signed-in account. */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const payload = schema.parse(await request.json());
    const user = await prisma.appUser.findUniqueOrThrow({ where: { id: session.userId }, select: { id: true, email: true, displayName: true } });
    if (payload.step === "options") {
      if ((await prisma.passkey.count({ where: { userId: user.id } })) >= 20) throw new AuthError("Maximal 20 Passkeys pro Account.", 400);
      return NextResponse.json(await registrationOptions(request, user, "add-passkey"));
    }
    const challenge = await consumeChallenge(payload.challengeId, "add-passkey");
    if (challenge.userId !== user.id) throw new AuthError("Die Passkey-Anfrage gehört zu einem anderen Account.", 403);
    const passkey = await verifyRegistration(request, challenge.challenge, payload.response as unknown as RegistrationResponseJSON);
    const created = await storePasskey(prisma, user.id, passkey, payload.name || passkeyName(request.headers.get("user-agent")));
    return NextResponse.json({ passkey: created }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Passkey konnte nicht hinzugefügt werden.");
  }
}
