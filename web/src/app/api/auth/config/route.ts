import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { emailVerificationMode, isMailConfigured } from "@/lib/mailer";
import { getRegistrationMode } from "@/lib/tokens";

export const dynamic = "force-dynamic";

/** Public instance configuration for the login screen. */
export async function GET() {
  const mode = getRegistrationMode();
  // The very first account can always be created (otherwise nobody could set up the instance).
  const hasUsers = mode === "open" ? true : (await prisma.appUser.count({ take: 1 })) > 0;
  return NextResponse.json({
    registrationMode: hasUsers ? mode : "open",
    mailConfigured: isMailConfigured(),
    emailVerification: emailVerificationMode(),
  });
}
