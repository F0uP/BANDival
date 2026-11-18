import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/http";
import { parseIcsBusyBlocks } from "@/lib/ics";

const FETCH_TIMEOUT_MS = 15_000;
const MAX_ICS_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 4;
export const SYNC_STALE_AFTER_MS = 30 * 60 * 1000;
const PAST_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;
const FUTURE_WINDOW_MS = 400 * 24 * 60 * 60 * 1000;

export function allowPrivateTargets(): boolean {
  return process.env.CALENDAR_SYNC_ALLOW_PRIVATE === "true";
}

/** IPv4-mapped/-translated IPv6 (::ffff:7f00:1, 64:ff9b::a00:1) → the embedded IPv4 address. */
function embeddedIpv4(address: string): string | null {
  const match = address.match(/^(?:::ffff:|64:ff9b::|::)(?:(\d+\.\d+\.\d+\.\d+)|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/);
  if (!match) return null;
  if (match[1]) return match[1];
  const high = parseInt(match[2], 16);
  const low = parseInt(match[3], 16);
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

/** Loopback, private, link-local (cloud metadata), CGNAT, multicast and reserved ranges – never fetched. */
export function isPrivateAddress(address: string): boolean {
  const lower = address.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  const normalized = embeddedIpv4(lower) ?? lower;
  if (isIP(normalized) === 4) {
    const [a, b, c] = normalized.split(".").map(Number);
    return (
      a === 0
      || a === 10
      || a === 127
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 0 && (c === 0 || c === 2))
      || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19))
      || (a === 198 && b === 51 && c === 100)
      || (a === 203 && b === 0 && c === 113)
      || a >= 224
    );
  }
  if (isIP(normalized) !== 6) return true;
  return (
    normalized === "::"
    || normalized === "::1"
    || /^f[cd]/.test(normalized)
    || /^fe[89ab]/.test(normalized)
    || normalized.startsWith("fec")
    || normalized.startsWith("ff")
    || normalized.startsWith("2001:db8")
    || normalized.startsWith("64:ff9b:")
  );
}

type LookupCallback = (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/** DNS lookup that refuses private/internal targets at connect time (protects against DNS rebinding). */
export function guardedLookup(hostname: string, options: { all?: boolean; family?: number }, callback: LookupCallback): void {
  dnsLookup(hostname, { family: options.family, all: true }, (error, addresses) => {
    if (error) {
      callback(error, []);
      return;
    }
    const list = addresses as LookupAddress[];
    if (!allowPrivateTargets() && list.some((entry) => isPrivateAddress(entry.address))) {
      callback(Object.assign(new Error("Interne Adressen sind für den Kalender-Import nicht erlaubt."), { code: "EBLOCKED" }), []);
      return;
    }
    if (options.all) {
      callback(null, list);
    } else {
      callback(null, list[0]?.address ?? "", list[0]?.family);
    }
  });
}

export function normalizeCalendarUrl(raw: string): URL {
  let value = raw.trim();
  if (value.toLowerCase().startsWith("webcal://")) {
    value = `https://${value.slice("webcal://".length)}`;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new HttpError("Ungültige Kalender-URL.", 400);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new HttpError("Nur http(s)- oder webcal-Links werden unterstützt.", 400);
  }
  if (url.username || url.password) {
    throw new HttpError("Zugangsdaten in der URL werden nicht unterstützt.", 400);
  }
  // IP literals never go through DNS lookup, so they have to be checked here.
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && isPrivateAddress(host) && !allowPrivateTargets()) {
    throw new HttpError("Interne Adressen sind für den Kalender-Import nicht erlaubt.", 400);
  }
  return url;
}

function requestOnce(url: URL): Promise<{ status: number; location?: string; body?: string }> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const req = client.request(
      url,
      {
        method: "GET",
        headers: {
          Accept: "text/calendar, text/plain;q=0.8, */*;q=0.5",
          "User-Agent": "Bandival-CalendarSync/1.0",
        },
        lookup: guardedLookup as never,
        timeout: FETCH_TIMEOUT_MS,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          resolve({ status, location: res.headers.location });
          return;
        }
        if (status < 200 || status >= 300) {
          res.resume();
          resolve({ status });
          return;
        }

        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_ICS_BYTES) {
            req.destroy(new Error("Kalender ist zu groß (max. 10 MB)."));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => resolve({ status, body: Buffer.concat(chunks).toString("utf8") }));
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("Zeitüberschreitung beim Abrufen des Kalenders.")));
    req.on("error", reject);
    req.end();
  });
}

export async function fetchIcs(rawUrl: string): Promise<string> {
  let url = normalizeCalendarUrl(rawUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const result = await requestOnce(url);
    if (result.location) {
      url = normalizeCalendarUrl(new URL(result.location, url).toString());
      continue;
    }
    if (result.status === 401 || result.status === 403) {
      throw new HttpError("Der Kalender ist nicht öffentlich abrufbar. Bitte die geheime iCal-Adresse verwenden.", 400);
    }
    if (result.status === 404) {
      throw new HttpError("Kalender nicht gefunden (404).", 400);
    }
    if (!result.body) {
      throw new HttpError(`Kalender konnte nicht geladen werden (HTTP ${result.status}).`, 400);
    }
    if (!result.body.includes("BEGIN:VCALENDAR")) {
      throw new HttpError("Die Adresse liefert keine gültigen iCal-Daten.", 400);
    }
    return result.body;
  }
  throw new HttpError("Zu viele Weiterleitungen.", 400);
}

function syncWindow(): { start: Date; end: Date } {
  const now = Date.now();
  return { start: new Date(now - PAST_WINDOW_MS), end: new Date(now + FUTURE_WINDOW_MS) };
}

/** Replaces all busy blocks of a source with the given ICS content. */
export async function importIcsIntoSource(sourceId: string, userId: string, icsText: string): Promise<number> {
  const window = syncWindow();
  let blocks;
  try {
    blocks = parseIcsBusyBlocks(icsText, window.start, window.end);
  } catch {
    throw new HttpError("Die iCal-Daten konnten nicht gelesen werden.", 400);
  }

  await prisma.$transaction(async (tx) => {
    await tx.calendarBusyBlock.deleteMany({ where: { sourceId } });
    if (blocks.length > 0) {
      await tx.calendarBusyBlock.createMany({
        data: blocks.map((block) => ({ ...block, sourceId, userId })),
      });
    }
    await tx.calendarSource.update({
      where: { id: sourceId },
      data: { lastSyncedAt: new Date(), lastError: null },
    });
  });

  return blocks.length;
}

/** Fetches a URL-based source and stores its busy blocks. Records the error on the source on failure. */
export async function syncCalendarSource(sourceId: string): Promise<{ ok: boolean; count?: number; error?: string }> {
  const source = await prisma.calendarSource.findUnique({ where: { id: sourceId } });
  if (!source || source.kind !== "ics_url" || !source.url) {
    return { ok: false, error: "Quelle kann nicht synchronisiert werden." };
  }

  try {
    const ics = await fetchIcs(source.url);
    const count = await importIcsIntoSource(source.id, source.userId, ics);
    return { ok: true, count };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Synchronisierung fehlgeschlagen.";
    await prisma.calendarSource.update({
      where: { id: source.id },
      data: { lastError: message.slice(0, 500), lastSyncedAt: new Date() },
    });
    return { ok: false, error: message };
  }
}

const runningSyncs = new Set<string>();

/** Syncs all stale URL sources of the given users (used opportunistically when calendars are viewed). */
export async function syncStaleSources(userIds: string[]): Promise<void> {
  if (userIds.length === 0) {
    return;
  }
  const staleBefore = new Date(Date.now() - SYNC_STALE_AFTER_MS);
  const sources = await prisma.calendarSource.findMany({
    where: {
      userId: { in: userIds },
      kind: "ics_url",
      enabled: true,
      OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: staleBefore } }],
    },
    select: { id: true },
    take: 20,
  });

  for (const source of sources) {
    if (runningSyncs.has(source.id)) {
      continue;
    }
    runningSyncs.add(source.id);
    try {
      await syncCalendarSource(source.id);
    } finally {
      runningSyncs.delete(source.id);
    }
  }
}
