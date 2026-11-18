import type { Transporter } from "nodemailer";

let cachedTransport: Transporter | null = null;

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function getAppBaseUrl(): string {
  return (
    process.env.APP_BASE_URL
    ?? process.env.NEXT_PUBLIC_APP_URL
    ?? "http://localhost:3000"
  ).replace(/\/$/, "");
}

export function isMailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

export type EmailVerificationMode = "required" | "optional" | "off";

/**
 * E-mail verification only works with mail delivery – without SMTP it is switched off automatically.
 * EMAIL_VERIFICATION=required (default) locks the app until the address is confirmed, "optional" only reminds.
 */
export function emailVerificationMode(): EmailVerificationMode {
  if (!isMailConfigured()) return "off";
  const value = (process.env.EMAIL_VERIFICATION ?? "required").trim().toLowerCase();
  if (value === "optional") return "optional";
  if (value === "off" || value === "false" || value === "0") return "off";
  return "required";
}

async function getTransport(): Promise<Transporter | null> {
  if (!isMailConfigured()) {
    return null;
  }
  if (cachedTransport) {
    return cachedTransport;
  }

  const nodemailer = await import("nodemailer");
  cachedTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        }
      : undefined,
  });
  return cachedTransport;
}

function renderLayout(title: string, bodyHtml: string): string {
  return `<!doctype html><html lang="de"><body style="margin:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b">
<div style="max-width:520px;margin:32px auto;background:#fff;border-radius:16px;padding:28px;border:1px solid #e4e4e7">
<p style="margin:0 0 16px;font-weight:700;font-size:15px;letter-spacing:.02em;color:#0891b2">Bandival</p>
<h1 style="margin:0 0 12px;font-size:20px">${escapeHtml(title)}</h1>
${bodyHtml}
</div></body></html>`;
}

export async function sendMail(args: {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  action?: { label: string; url: string };
}): Promise<{ sent: boolean; reason?: string }> {
  const recipients = Array.isArray(args.to) ? args.to : [args.to];
  if (recipients.length === 0) {
    return { sent: false, reason: "Keine Empfänger." };
  }

  try {
    const transport = await getTransport();
    if (!transport) {
      return { sent: false, reason: "SMTP ist nicht konfiguriert." };
    }

    const paragraphs = args.text
      .split(/\n{2,}/)
      .map((paragraph) => `<p style="margin:0 0 12px;line-height:1.5">${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`)
      .join("");
    const action = args.action
      ? `<p style="margin:20px 0 0"><a href="${escapeHtml(args.action.url)}" style="display:inline-block;background:#0891b2;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:600">${escapeHtml(args.action.label)}</a></p>`
      : "";

    await transport.sendMail({
      from: process.env.SMTP_FROM,
      // Use BCC for multi-recipient notifications so addresses are not exposed to each other.
      ...(recipients.length > 1 ? { bcc: recipients.join(",") } : { to: recipients[0] }),
      subject: args.subject,
      text: args.action ? `${args.text}\n\n${args.action.label}: ${args.action.url}` : args.text,
      html: args.html ?? renderLayout(args.subject, `${paragraphs}${action}`),
    });

    return { sent: true };
  } catch (error) {
    console.error("[mail]", error);
    return { sent: false, reason: error instanceof Error ? error.message : "SMTP-Versand fehlgeschlagen." };
  }
}
