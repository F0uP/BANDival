import { getAppBaseUrl, sendMail } from "@/lib/mailer";
import { createUserToken } from "@/lib/tokens";

export async function sendVerificationMail(user: { id: string; email: string; displayName: string }) {
  const token = await createUserToken(user.id, "email_verify", 60 * 24 * 3);
  return sendMail({
    to: user.email,
    subject: "Bitte bestätige deine E-Mail-Adresse",
    text: `Hallo ${user.displayName},\n\nbitte bestätige deine E-Mail-Adresse für Bandival. Der Link ist drei Tage gültig.`,
    action: { label: "E-Mail bestätigen", url: `${getAppBaseUrl()}/verify-email?token=${encodeURIComponent(token)}` },
  });
}

export async function sendPasswordResetMail(user: { id: string; email: string; displayName: string }) {
  const token = await createUserToken(user.id, "password_reset", 60);
  return sendMail({
    to: user.email,
    subject: "Passwort zurücksetzen",
    text: `Hallo ${user.displayName},\n\njemand (hoffentlich du) möchte das Passwort für deinen Bandival-Account zurücksetzen. Der Link ist eine Stunde gültig.\n\nFalls du das nicht warst, kannst du diese Mail ignorieren.`,
    action: { label: "Neues Passwort festlegen", url: `${getAppBaseUrl()}/reset-password?token=${encodeURIComponent(token)}` },
  });
}
