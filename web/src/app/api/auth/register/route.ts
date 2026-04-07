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
  password: z.string().min(10).max(300),
  displayName: z.string().min(1).max(100),
});

export async function POST(request: NextRequest) {
  try {
    const payload = schema.parse(await request.json());
    const normalizedEmail = payload.email.trim().toLowerCase();
    const ipAddress = getClientIp(request);
    const userAgent = request.headers.get("user-agent");

    await assertLoginAllowed(normalizedEmail, ipAddress);

    const existing = await prisma.appUser.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    if (existing) {
      await registerFailedLogin(normalizedEmail, ipAddress);
      throw new AuthError("Email address is already registered.", 409);
    }

    const passwordHash = await bcrypt.hash(payload.password, 12);
    const user = await prisma.appUser.create({
      data: {
        email: normalizedEmail,
        displayName: payload.displayName,
        passwordHash,
      },
    });

    await clearFailedLogin(normalizedEmail, ipAddress);

    const token = await createSession(
      {
        userId: user.id,
        email: user.email,
      },
      ipAddress,
      userAgent,
    );

    const response = NextResponse.json({ ok: true, user: { userId: user.id, email: user.email } }, { status: 201 });
    setSessionCookie(response, token);
    setCsrfCookie(response, createCsrfToken());
    return response;
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Registration failed." },
      { status: 400 },
    );
  }
}
