import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getAppBaseUrl, sendMail } from "@/lib/mailer";
import { sendNtfy, sendWebPush } from "@/lib/push";
import { translateFor } from "@/lib/i18n";
import { DEFAULT_LOCALE, isLocale, type Locale, type Values } from "@/lib/i18n/core";

export type NotificationKind = "invite" | "event" | "setlist" | "song";
export type Translate = (text: string, values?: Values) => string;

const PREFERENCE_FLAG: Record<NotificationKind, "notifyInvites" | "notifyEvents" | "notifySetlists" | "notifySongs"> = {
  invite: "notifyInvites",
  event: "notifyEvents",
  setlist: "notifySetlists",
  song: "notifySongs",
};

export function targetPath(payload: Record<string, unknown> | undefined): string {
  if (!payload) return "/app";
  if (typeof payload.url === "string" && payload.url.startsWith("/")) return payload.url;
  if (typeof payload.songId === "string") return `/app/songs/${payload.songId}`;
  if (typeof payload.setlistId === "string") return `/app/setlists/${payload.setlistId}`;
  if (typeof payload.eventId === "string") return `/app/events/${payload.eventId}`;
  return "/app";
}

type Message = {
  bandId: string;
  kind: NotificationKind;
  type: string;
  /** German source text – translated per recipient (exact keys and "{0}" templates). */
  title: string;
  body: string;
  /** Alternative to title/body when the text needs locale-aware formatting (dates, labels). */
  render?: (t: Translate, locale: Locale) => { title: string; body: string };
  payload?: Record<string, unknown>;
};

/** The language a user reads background messages in (stored when they pick a language). */
export function userLocale(value: string | null | undefined): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export function translatorFor(locale: Locale): Translate {
  return (text, values) => translateFor(locale, text, values);
}

function textFor(message: Message, locale: Locale): { title: string; body: string } {
  const t = translatorFor(locale);
  return message.render ? message.render(t, locale) : { title: t(message.title), body: t(message.body) };
}

/** Delivers a message to the given users on every channel they enabled (in-app, push/ntfy, e-mail) – in each user's language. */
export async function deliver(userIds: string[], message: Message, options: { forceEmail?: boolean } = {}): Promise<void> {
  if (userIds.length === 0) return;
  const [users, preferences] = await Promise.all([
    prisma.appUser.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true, ntfyTopicUrl: true, locale: true } }),
    prisma.notificationPreference.findMany({ where: { bandId: message.bandId, userId: { in: userIds } } }),
  ]);
  const byUser = new Map(preferences.map((preference) => [preference.userId, preference]));
  const flag = PREFERENCE_FLAG[message.kind];
  const wants = (userId: string) => {
    const preference = byUser.get(userId);
    return !preference || preference[flag];
  };

  // In-app notifications keep the German source text – the app translates it when it is displayed.
  const inApp = users.filter((user) => wants(user.id) && (byUser.get(user.id)?.inAppEnabled ?? true));
  if (inApp.length > 0) {
    const source = textFor(message, DEFAULT_LOCALE);
    await prisma.notification.createMany({
      data: inApp.map((user) => ({
        userId: user.id,
        bandId: message.bandId,
        type: message.type,
        title: source.title,
        body: source.body,
        payload: (message.payload ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      })),
    });
  }

  const url = targetPath(message.payload);
  const byLocale = new Map<Locale, typeof users>();
  for (const user of users) {
    const locale = userLocale(user.locale);
    byLocale.set(locale, [...(byLocale.get(locale) ?? []), user]);
  }

  await Promise.all([...byLocale.entries()].map(async ([locale, group]) => {
    const text = textFor(message, locale);
    const t = translatorFor(locale);
    const pushUsers = group.filter((user) => wants(user.id) && (byUser.get(user.id)?.pushEnabled ?? true));
    const push = { title: text.title, body: text.body, url, tag: message.type };
    await Promise.all([
      sendWebPush(pushUsers.map((user) => user.id), push).catch((error) => console.error("[push]", error)),
      ...pushUsers.filter((user) => user.ntfyTopicUrl).map((user) => sendNtfy(user.ntfyTopicUrl!, push)),
    ]);

    const emailUsers = group.filter((user) => wants(user.id) && (options.forceEmail || byUser.get(user.id)?.emailEnabled));
    if (emailUsers.length > 0) {
      await sendMail({
        to: emailUsers.map((user) => user.email),
        subject: text.title,
        text: text.body,
        action: { label: t("In Bandival öffnen"), url: `${getAppBaseUrl()}${url}` },
      });
    }
  }));
}

/**
 * Notifies all band members (except the actor). Guests only receive messages about their shared setlists.
 * Never throws: notification failures must not break the primary action.
 */
export async function notifyBandMembers(args: Message & { actorUserId?: string }): Promise<void> {
  try {
    const members = await prisma.bandMember.findMany({
      where: { bandId: args.bandId, role: { not: "guest" }, ...(args.actorUserId ? { userId: { not: args.actorUserId } } : {}) },
      select: { userId: true },
    });
    await deliver(members.map((member) => member.userId), args);
  } catch (error) {
    console.error("[notify]", error);
  }
}
