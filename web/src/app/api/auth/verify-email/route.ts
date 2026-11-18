import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/http";
import { consumeUserToken } from "@/lib/tokens";

const schema = z.object({ token: z.string().min(10).max(200) });

export async function POST(request: NextRequest) {
  try {
    const { token } = schema.parse(await request.json());
    const userId = await consumeUserToken(token, "email_verify");
    await prisma.appUser.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "E-Mail-Adresse konnte nicht bestätigt werden.");
  }
}
