import type { BandInvite } from "@prisma/client";

function getBaseUrl(): string {
  return (
    process.env.APP_BASE_URL
    ?? process.env.NEXT_PUBLIC_APP_URL
    ?? "http://localhost:3000"
  ).replace(/\/$/, "");
}

export function buildInviteLink(token: string): string {
  return `${getBaseUrl()}/app?inviteToken=${encodeURIComponent(token)}`;
}

export async function sendInviteEmail(args: {
  recipientEmail: string;
  bandName: string;
  invite: Pick<BandInvite, "expiresAt">;
  token: string;
}): Promise<{ sent: boolean; reason?: string; link: string }> {
  const link = buildInviteLink(args.token);
  const host = process.env.SMTP_HOST;
  const from = process.env.SMTP_FROM;

  if (!host || !from) {
    return { sent: false, reason: "SMTP not configured", link };
  }

  try {
    const nodemailer = await import("nodemailer");
    const port = Number(process.env.SMTP_PORT ?? 587);
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          }
        : undefined,
    });

    await transporter.sendMail({
      from,
      to: args.recipientEmail,
      subject: `Einladung zu ${args.bandName}`,
      text: `Du wurdest zu ${args.bandName} eingeladen.\n\nLink: ${link}\nGueltig bis: ${args.invite.expiresAt.toISOString()}`,
      html: `<p>Du wurdest zu <strong>${args.bandName}</strong> eingeladen.</p><p><a href="${link}">Einladung annehmen</a></p><p>Gueltig bis: ${args.invite.expiresAt.toISOString()}</p>`,
    });

    return { sent: true, link };
  } catch (error) {
    return {
      sent: false,
      reason: error instanceof Error ? error.message : "SMTP send failed",
      link,
    };
  }
}
