import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  assertLoginAllowed,
  AuthError,
  clearFailedLogin,
  createCsrfToken,
  createSession,
  getClientIp,
  registerFailedLogin,
  setCsrfCookie,
  setSessionCookie,
} from "@/lib/auth";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(300),
});

export async function POST(request: NextRequest) {
  try {
    const payload = schema.parse(await request.json());
    const ipAddress = getClientIp(request);
    const userAgent = request.headers.get("user-agent");

    await assertLoginAllowed(payload.email, ipAddress);

    const user = await prisma.appUser.findUnique({
      where: {
        email: payload.email,
      },
    });

    if (!user?.passwordHash) {
      await registerFailedLogin(payload.email, ipAddress);
      throw new AuthError("Invalid credentials.", 401);
    }

    const passwordOk = await bcrypt.compare(payload.password, user.passwordHash);
    if (!passwordOk) {
      await registerFailedLogin(payload.email, ipAddress);
      throw new AuthError("Invalid credentials.", 401);
    }

    await clearFailedLogin(payload.email, ipAddress);

    const token = await createSession(
      {
        userId: user.id,
        email: user.email,
      },
      ipAddress,
      userAgent,
    );

    const response = NextResponse.json({ ok: true, user: { userId: user.id, email: user.email } });
    setSessionCookie(response, token);
    setCsrfCookie(response, createCsrfToken());
    return response;
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Login failed." },
      { status: 400 },
    );
  }
}
