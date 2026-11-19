import type { BandInvite } from "@/generated/prisma/client";
import { longDate } from "@/lib/account-mail";
import { getT } from "@/lib/i18n/server";
import { getAppBaseUrl, sendMail } from "@/lib/mailer";

export function buildInviteLink(token: string): string {
  return `${getAppBaseUrl()}/app?inviteToken=${encodeURIComponent(token)}`;
}

/** Written in the inviting person's language – the recipient's language is not known yet. */
export async function sendInviteEmail(args: {
  recipientEmail: string;
  bandName: string;
  invite: Pick<BandInvite, "expiresAt">;
  token: string;
}): Promise<{ sent: boolean; reason?: string; link: string }> {
  const link = buildInviteLink(args.token);
  const t = await getT();
  const validUntil = await longDate(args.invite.expiresAt);

  const result = await sendMail({
    to: args.recipientEmail,
    subject: t("Einladung zu {0}", { 0: args.bandName }),
    text: t(
      "Du wurdest eingeladen, der Band „{0}“ auf Bandival beizutreten.\n\nDer Link ist gültig bis {1}. Falls du noch keinen Account hast, kannst du dich direkt mit dieser E-Mail-Adresse registrieren.",
      { 0: args.bandName, 1: validUntil },
    ),
    action: { label: t("Einladung annehmen"), url: link },
  });

  return { ...result, link };
}
