import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertLoginAllowed, getClientIp, registerFailedLogin } from "@/lib/auth";
import { sendPasswordResetMail } from "@/lib/account-mail";
import { errorResponse } from "@/lib/http";
import { isMailConfigured } from "@/lib/mailer";

const schema = z.object({ email: z.string().trim().toLowerCase().email("Bitte eine gültige E-Mail-Adresse eingeben.") });

/** Always answers the same way so that registered addresses cannot be discovered. */
export async function POST(request: NextRequest) {
  try {
    const { email } = schema.parse(await request.json());
    const ip = getClientIp(request);
    await assertLoginAllowed(`reset:${email}`, ip);
    // Count every request towards the rate limit to prevent mail flooding.
    await registerFailedLogin(`reset:${email}`, ip);

    const user = await prisma.appUser.findUnique({ where: { email }, select: { id: true, email: true, displayName: true } });
    if (user && isMailConfigured()) {
      await sendPasswordResetMail(user);
    }

    return NextResponse.json({ ok: true, mailConfigured: isMailConfigured() });
  } catch (error) {
    return errorResponse(error);
  }
}
