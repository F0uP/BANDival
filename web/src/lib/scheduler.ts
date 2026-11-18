import { prisma } from "@/lib/prisma";
import { AvailabilityIndex, eventInterval, loadAvailabilityContext } from "@/lib/availability";
import { writeScheduledBackup } from "@/lib/backup";
import { syncStaleSources } from "@/lib/calendar-sync";
import { dateKeyInZone, isoWeekday, timeInZone } from "@/lib/dates";
import { getAppBaseUrl, isMailConfigured, sendMail } from "@/lib/mailer";
import { deliver } from "@/lib/notifications";
import { refreshOpenStemJobs } from "@/lib/stem-separation";

const INTERVAL_MS = 5 * 60 * 1000;
const KIND_LABEL: Record<string, string> = { rehearsal: "Probe", gig: "Gig", meeting: "Meeting", other: "Termin" };

/** Claims a job key exactly once (works across restarts and multiple instances). */
async function claim(key: string): Promise<boolean> {
  try {
    await prisma.jobLog.create({ data: { key } });
    return true;
  } catch {
    return false;
  }
}

function when(date: Date, timeZone: string): string {
  return date.toLocaleString("de-DE", { timeZone, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Reminder 24 h before an event + nudge for missing answers 72 h before. */
async function eventReminders(now: Date) {
  const events = await prisma.event.findMany({
    where: {
      startsAt: { gt: now, lt: new Date(now.getTime() + 72 * 3600_000) },
      status: { notIn: ["cancelled", "availability_template"] },
    },
    include: {
      band: { select: { id: true, timezone: true, members: { where: { role: { not: "guest" } }, select: { userId: true } } } },
      availabilities: { select: { userId: true, status: true, note: true } },
    },
  });

  for (const event of events) {
    const timeZone = event.band.timezone;
    const userIds = event.band.members.map((member) => member.userId);
    const hoursUntil = (event.startsAt.getTime() - now.getTime()) / 3600_000;
    const preferences = await prisma.notificationPreference.findMany({ where: { bandId: event.bandId, userId: { in: userIds } } });
    const remindersOff = new Set(preferences.filter((preference) => !preference.remindersEnabled).map((preference) => preference.userId));
    const { dayEntries, blocks } = await loadAvailabilityContext(userIds, eventInterval(event));
    const index = new AvailabilityIndex(dayEntries, blocks, timeZone);
    const explicit = new Map(event.availabilities.map((entry) => [entry.userId, entry]));
    const label = `${KIND_LABEL[event.kind] ?? "Termin"}: ${event.title}`;
    const { start, end } = eventInterval(event);

    for (const userId of userIds) {
      if (remindersOff.has(userId)) continue;
      const status = index.resolveWindow(userId, start, end, explicit.get(userId) ?? null).status;

      if (hoursUntil <= 24 && status !== "unavailable" && (await claim(`reminder:${event.id}:${userId}`))) {
        await deliver([userId], {
          bandId: event.bandId,
          kind: "event",
          type: "event_reminder",
          title: `Erinnerung – ${label}`,
          body: `${when(event.startsAt, timeZone)}${event.venueLabel ? ` · ${event.venueLabel}` : ""}`,
          payload: { eventId: event.id },
        });
      } else if (hoursUntil > 24 && status === null && (await claim(`nudge:${event.id}:${userId}`))) {
        await deliver([userId], {
          bandId: event.bandId,
          kind: "event",
          type: "event_rsvp_nudge",
          title: `Kannst du? ${label}`,
          body: `${when(event.startsAt, timeZone)} – bitte sag kurz zu oder ab.`,
          payload: { eventId: event.id },
        });
      }
    }
  }
}

/** Weekly e-mail digest (Mondays 8–10 h band time) for members who enabled it. */
async function weeklyDigest(now: Date) {
  if (!isMailConfigured()) return;
  const preferences = await prisma.notificationPreference.findMany({
    where: { digestEnabled: true },
    include: { user: { select: { email: true, displayName: true } } },
  });
  for (const preference of preferences) {
    const band = await prisma.band.findUnique({ where: { id: preference.bandId }, select: { id: true, name: true, timezone: true } });
    if (!band) continue;
    const today = dateKeyInZone(now, band.timezone);
    const hour = Number(timeInZone(now, band.timezone).slice(0, 2));
    if (isoWeekday(today) !== 1 || hour < 8 || hour > 10) continue;
    if (!(await claim(`digest:${band.id}:${preference.userId}:${today}`))) continue;

    const weekAhead = new Date(now.getTime() + 7 * 86_400_000);
    const [events, tasks, songs] = await Promise.all([
      prisma.event.findMany({
        where: { bandId: band.id, startsAt: { gte: now, lt: weekAhead }, status: { notIn: ["cancelled", "availability_template"] } },
        orderBy: { startsAt: "asc" },
      }),
      prisma.kanbanTask.count({ where: { bandId: band.id, status: { not: "done" } } }),
      prisma.song.findMany({ where: { bandId: band.id, createdAt: { gte: new Date(now.getTime() - 7 * 86_400_000) } }, select: { title: true } }),
    ]);

    const lines = [
      `Hallo ${preference.user.displayName}, das steht diese Woche bei ${band.name} an:`,
      events.length
        ? events.map((event) => `• ${when(event.startsAt, band.timezone)} – ${KIND_LABEL[event.kind] ?? "Termin"}: ${event.title}${event.venueLabel ? ` (${event.venueLabel})` : ""}`).join("\n")
        : "• Keine Termine in den nächsten 7 Tagen.",
      `Offene Aufgaben: ${tasks}`,
      songs.length ? `Neue Songs: ${songs.map((song) => song.title).join(", ")}` : "",
    ].filter(Boolean);

    await sendMail({
      to: preference.user.email,
      subject: `Wochenüberblick ${band.name}`,
      text: lines.join("\n\n"),
      action: { label: "Bandival öffnen", url: `${getAppBaseUrl()}/app` },
    });
  }
}

/** Books monthly recurring transactions (e.g. rehearsal room rent). */
async function recurringTransactions(now: Date) {
  const recurring = await prisma.recurringTransaction.findMany({ where: { active: true }, include: { band: { select: { timezone: true } } } });
  for (const entry of recurring) {
    const today = dateKeyInZone(now, entry.band.timezone);
    const month = today.slice(0, 7);
    const day = Number(today.slice(8, 10));
    const lastDay = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
    if (entry.lastRunMonth === month || day < Math.min(entry.dayOfMonth, lastDay)) continue;
    if (!(await claim(`recurring:${entry.id}:${month}`))) continue;
    const bookingDay = String(Math.min(entry.dayOfMonth, lastDay)).padStart(2, "0");
    await prisma.$transaction([
      prisma.financeTransaction.create({
        data: {
          bandId: entry.bandId,
          date: new Date(`${month}-${bookingDay}T00:00:00.000Z`),
          amountCents: entry.amountCents,
          category: entry.category,
          description: entry.description,
          recurringId: entry.id,
        },
      }),
      prisma.recurringTransaction.update({ where: { id: entry.id }, data: { lastRunMonth: month } }),
    ]);
  }
}

/** Daily JSON backups at night (band time). */
async function nightlyBackups(now: Date) {
  if (process.env.BACKUP_ENABLED === "false") return;
  const bands = await prisma.band.findMany({ select: { id: true, timezone: true } });
  for (const band of bands) {
    const hour = Number(timeInZone(now, band.timezone).slice(0, 2));
    if (hour < 3 || hour > 5) continue;
    const today = dateKeyInZone(now, band.timezone);
    if (!(await claim(`backup:${band.id}:${today}`))) continue;
    await writeScheduledBackup(band.id, today).catch((error) => console.error("[backup]", error));
  }
}

async function housekeeping(now: Date) {
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000);
  await Promise.all([
    prisma.authSession.deleteMany({ where: { OR: [{ expiresAt: { lt: now } }, { revokedAt: { lt: monthAgo } }] } }),
    prisma.userToken.deleteMany({ where: { expiresAt: { lt: monthAgo } } }),
    prisma.jobLog.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 120 * 86_400_000) } } }),
    prisma.notification.deleteMany({ where: { readAt: { lt: new Date(now.getTime() - 180 * 86_400_000) } } }),
    prisma.authRateLimit.deleteMany({ where: { updatedAt: { lt: monthAgo } } }),
  ]);
}

async function calendarSync() {
  const sources = await prisma.calendarSource.findMany({ where: { kind: "ics_url", enabled: true }, select: { userId: true }, distinct: ["userId"] });
  await syncStaleSources(sources.map((source) => source.userId));
}

let running = false;

export async function runScheduledJobs(now = new Date()): Promise<void> {
  if (running) return;
  running = true;
  try {
    for (const [name, job] of [
      ["reminders", () => eventReminders(now)],
      ["digest", () => weeklyDigest(now)],
      ["recurring", () => recurringTransactions(now)],
      ["backups", () => nightlyBackups(now)],
      ["calendar", () => calendarSync()],
      ["ai-jobs", () => refreshOpenStemJobs()],
      ["housekeeping", () => housekeeping(now)],
    ] as const) {
      try {
        await job();
      } catch (error) {
        console.error(`[scheduler:${name}]`, error);
      }
    }
  } finally {
    running = false;
  }
}

let started = false;

export function startScheduler(): void {
  if (started || process.env.SCHEDULER_ENABLED === "false") return;
  started = true;
  setTimeout(() => void runScheduledJobs(), 60_000).unref?.();
  setInterval(() => void runScheduledJobs(), INTERVAL_MS).unref?.();
  console.log("[scheduler] started");
}
