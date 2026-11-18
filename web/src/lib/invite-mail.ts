import type { BandInvite } from "@prisma/client";
import { getAppBaseUrl, sendMail } from "@/lib/mailer";

export function buildInviteLink(token: string): string {
  return `${getAppBaseUrl()}/app?inviteToken=${encodeURIComponent(token)}`;
}

export async function sendInviteEmail(args: {
  recipientEmail: string;
  bandName: string;
  invite: Pick<BandInvite, "expiresAt">;
  token: string;
}): Promise<{ sent: boolean; reason?: string; link: string }> {
  const link = buildInviteLink(args.token);
  const validUntil = args.invite.expiresAt.toLocaleDateString("de-DE", { dateStyle: "long" });

  const result = await sendMail({
    to: args.recipientEmail,
    subject: `Einladung zu ${args.bandName}`,
    text: `Du wurdest eingeladen, der Band „${args.bandName}“ auf Bandival beizutreten.\n\nDer Link ist gültig bis ${validUntil}. Falls du noch keinen Account hast, kannst du dich direkt mit dieser E-Mail-Adresse registrieren.`,
    action: { label: "Einladung annehmen", url: link },
  });

  return { ...result, link };
}
