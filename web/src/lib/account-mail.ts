import { intlLocaleOf } from "@/lib/i18n/core";
import { getLocale, getT } from "@/lib/i18n/server";
import { getAppBaseUrl, sendMail } from "@/lib/mailer";
import { createUserToken } from "@/lib/tokens";

// Mails are written in the language of the request that triggers them (cookie / Accept-Language).

export async function sendVerificationMail(user: { id: string; email: string; displayName: string }) {
  const token = await createUserToken(user.id, "email_verify", 60 * 24 * 3);
  const t = await getT();
  return sendMail({
    to: user.email,
    subject: t("Bitte bestätige deine E-Mail-Adresse"),
    text: t("Hallo {0},\n\nbitte bestätige deine E-Mail-Adresse für Bandival. Der Link ist drei Tage gültig.", { 0: user.displayName }),
    action: { label: t("E-Mail bestätigen"), url: `${getAppBaseUrl()}/verify-email?token=${encodeURIComponent(token)}` },
  });
}

export async function sendPasswordResetMail(user: { id: string; email: string; displayName: string }) {
  const token = await createUserToken(user.id, "password_reset", 60);
  const t = await getT();
  return sendMail({
    to: user.email,
    subject: t("Passwort zurücksetzen"),
    text: t(
      "Hallo {0},\n\njemand (hoffentlich du) möchte das Passwort für deinen Bandival-Account zurücksetzen. Der Link ist eine Stunde gültig.\n\nFalls du das nicht warst, kannst du diese Mail ignorieren.",
      { 0: user.displayName },
    ),
    action: { label: t("Neues Passwort festlegen"), url: `${getAppBaseUrl()}/reset-password?token=${encodeURIComponent(token)}` },
  });
}

/** Long date in the request language, e.g. for invitation expiry. */
export async function longDate(value: Date): Promise<string> {
  return value.toLocaleDateString(intlLocaleOf(await getLocale()), { dateStyle: "long" });
}
