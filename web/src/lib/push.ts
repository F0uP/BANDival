import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import { allowPrivateTargets, guardedLookup, isPrivateAddress } from "@/lib/calendar-sync";
import { getAppBaseUrl } from "@/lib/mailer";

export type PushMessage = { title: string; body: string; url?: string; tag?: string };

let vapidPromise: Promise<{ publicKey: string; privateKey: string }> | null = null;

/** VAPID keys from env, or generated once and stored in the database. */
export function getVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  vapidPromise ??= (async () => {
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
    }
    const stored = await prisma.appSetting.findUnique({ where: { key: "vapid" } });
    if (stored) {
      return JSON.parse(stored.value) as { publicKey: string; privateKey: string };
    }
    const keys = webpush.generateVAPIDKeys();
    await prisma.appSetting.upsert({ where: { key: "vapid" }, create: { key: "vapid", value: JSON.stringify(keys) }, update: {} });
    const saved = await prisma.appSetting.findUniqueOrThrow({ where: { key: "vapid" } });
    return JSON.parse(saved.value) as { publicKey: string; privateKey: string };
  })().catch((error) => {
    vapidPromise = null;
    throw error;
  });
  return vapidPromise;
}

function subjectFor(): string {
  const from = process.env.SMTP_FROM?.match(/<([^>]+)>/)?.[1] ?? process.env.SMTP_FROM;
  return from && from.includes("@") ? `mailto:${from}` : getAppBaseUrl().startsWith("https://") ? getAppBaseUrl() : "mailto:admin@bandival.invalid";
}

/** Sends a Web Push message to all registered devices of the given users. Expired subscriptions are removed. */
export async function sendWebPush(userIds: string[], message: PushMessage): Promise<number> {
  if (userIds.length === 0) return 0;
  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } });
  if (subscriptions.length === 0) return 0;

  const keys = await getVapidKeys();
  const payload = JSON.stringify({ ...message, url: message.url ?? "/app" });
  let delivered = 0;

  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        payload,
        { vapidDetails: { subject: subjectFor(), publicKey: keys.publicKey, privateKey: keys.privateKey }, TTL: 60 * 60 * 12 },
      );
      delivered += 1;
      await prisma.pushSubscription.update({ where: { id: subscription.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await prisma.pushSubscription.delete({ where: { id: subscription.id } }).catch(() => undefined);
      } else {
        console.error("[push]", status ?? error);
      }
    }
  }));
  return delivered;
}

/** Publishes a message to an ntfy topic (https://ntfy.sh or self-hosted) – used by the Android app & ntfy clients. */
export function sendNtfy(topicUrl: string, message: PushMessage): Promise<boolean> {
  return new Promise((resolve) => {
    let url: URL;
    try {
      url = new URL(topicUrl);
    } catch {
      resolve(false);
      return;
    }
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if ((url.protocol !== "https:" && url.protocol !== "http:") || (isIP(host) && isPrivateAddress(host) && !allowPrivateTargets())) {
      resolve(false);
      return;
    }
    const body = Buffer.from(message.body, "utf8");
    const click = message.url ? (message.url.startsWith("http") ? message.url : `${getAppBaseUrl()}${message.url}`) : undefined;
    const client = url.protocol === "https:" ? https : http;
    const req = client.request(url, {
      method: "POST",
      timeout: 8000,
      lookup: guardedLookup as never,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Length": String(body.length),
        // RFC 2047 encoding keeps umlauts intact in the title header.
        Title: `=?UTF-8?B?${Buffer.from(message.title, "utf8").toString("base64")}?=`,
        Tags: "musical_note",
        ...(click ? { Click: click } : {}),
      },
    }, (res) => {
      res.resume();
      resolve((res.statusCode ?? 500) < 300);
    });
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(false));
    req.end(body);
  });
}
