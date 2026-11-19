import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/http";
import { parseRider, renderRiderPdf, type Rider } from "@/lib/rider";
import { getAppBaseUrl } from "@/lib/mailer";

/**
 * Login-free links to the tech rider for venue technicians and promoters. The token is the only secret
 * (192 bit); links for a gig expire two weeks after the show, general band links stay until revoked.
 */

const GIG_LINK_GRACE_MS = 14 * 86_400_000;

export function riderShareUrl(token: string): string {
  return `${getAppBaseUrl()}/r/${token}`;
}

export async function createRiderShare(args: { bandId: string; eventId: string | null; userId: string }) {
  let expiresAt: Date | null = null;
  if (args.eventId) {
    const event = await prisma.event.findFirst({ where: { id: args.eventId, bandId: args.bandId }, select: { startsAt: true, endsAt: true } });
    if (!event) throw new HttpError("Termin gehört nicht zur Band.", 400);
    expiresAt = new Date((event.endsAt ?? event.startsAt).getTime() + GIG_LINK_GRACE_MS);
    // One active link per gig is enough – reuse it.
    const existing = await prisma.riderShare.findFirst({ where: { bandId: args.bandId, eventId: args.eventId }, orderBy: { createdAt: "desc" } });
    if (existing) return existing;
  }
  return prisma.riderShare.create({
    data: { token: randomBytes(24).toString("base64url"), bandId: args.bandId, eventId: args.eventId, createdByUserId: args.userId, expiresAt },
  });
}

export type SharedRider = {
  bandName: string;
  timezone: string;
  contactEmail: string | null;
  rider: Rider;
  event: null | {
    title: string;
    startsAt: Date;
    endsAt: Date | null;
    venue: string | null;
    loadInAt: Date | null;
    soundcheckAt: Date | null;
    doorsAt: Date | null;
    contactName: string | null;
  };
};

/** Resolves a public token – null when unknown, revoked or expired. */
export async function loadSharedRider(token: string): Promise<SharedRider | null> {
  if (!/^[\w-]{20,64}$/.test(token)) return null;
  const share = await prisma.riderShare.findUnique({
    where: { token },
    include: {
      band: { select: { name: true, timezone: true, contactEmail: true, rider: true } },
      event: { select: { title: true, startsAt: true, endsAt: true, venueLabel: true, loadInAt: true, soundcheckAt: true, doorsAt: true, contactName: true, status: true } },
    },
  });
  if (!share || (share.expiresAt && share.expiresAt < new Date())) return null;
  if (share.event?.status === "cancelled") return null;
  await prisma.riderShare.update({ where: { id: share.id }, data: { lastViewedAt: new Date() } }).catch(() => undefined);
  return {
    bandName: share.band.name,
    timezone: share.band.timezone,
    contactEmail: share.band.contactEmail,
    rider: parseRider(share.band.rider),
    event: share.event
      ? {
          title: share.event.title,
          startsAt: share.event.startsAt,
          endsAt: share.event.endsAt,
          venue: share.event.venueLabel,
          loadInAt: share.event.loadInAt,
          soundcheckAt: share.event.soundcheckAt,
          doorsAt: share.event.doorsAt,
          contactName: share.event.contactName,
        }
      : null,
  };
}

/** Rider PDF (with the gig's times when there is one) – shared by the app and the public link. */
export async function renderSharedRiderPdf(shared: SharedRider): Promise<Uint8Array> {
  const time = (value: Date | null) => value?.toLocaleTimeString("de-DE", { timeZone: shared.timezone, hour: "2-digit", minute: "2-digit" }) ?? null;
  return renderRiderPdf({
    bandName: shared.bandName,
    rider: shared.rider,
    contactEmail: shared.contactEmail,
    event: shared.event
      ? {
          title: shared.event.title,
          date: shared.event.startsAt.toLocaleDateString("de-DE", { timeZone: shared.timezone, weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }),
          venue: shared.event.venue,
          loadIn: time(shared.event.loadInAt),
          soundcheck: time(shared.event.soundcheckAt),
          doors: time(shared.event.doorsAt),
        }
      : undefined,
  });
}
