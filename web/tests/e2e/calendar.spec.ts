import { expect, test } from "@playwright/test";
import { ApiClient, dateKeyInDays, registerUser } from "./helpers";

type Overview = {
  days: Record<string, { mine: { status: string | null; source: string | null }; summary: { unavailable: number; total: number } }>;
  events: Array<{ id: string; title: string; availability: { mine: { status: string | null; source: string | null }; summary: { available: number } } }>;
};

function icsAllDay(dateKey: string, summary: string): string {
  const start = dateKey.replaceAll("-", "");
  const next = new Date(`${dateKey}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const end = next.toISOString().slice(0, 10).replaceAll("-", "");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//E2E//Test//EN",
    "BEGIN:VEVENT",
    `UID:e2e-${start}@test`,
    `DTSTAMP:${start}T000000Z`,
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${end}`,
    `SUMMARY:${summary}`,
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:e2e-free@test",
    `DTSTAMP:${start}T000000Z`,
    `DTSTART:${start}T080000Z`,
    `DTEND:${start}T090000Z`,
    "TRANSP:TRANSPARENT",
    "SUMMARY:Free time should not block",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

test.describe("calendar", () => {
  test("events, RSVP, imported calendar blocks, day availability and suggestions", async ({ baseURL }) => {
    const { api, bandId } = await registerUser(baseURL!);
    const day = dateKeyInDays(10);
    const otherDay = dateKeyInDays(12);

    // A weekly rehearsal series keeps its local time across DST changes.
    const created = await api.json<{ events: Array<{ id: string; startsAt: string }> }>(api.post("/api/events", {
      bandId,
      title: "Probe",
      kind: "rehearsal",
      startsAt: `${day}T17:00:00.000Z`,
      endsAt: `${day}T20:00:00.000Z`,
      recurrenceEveryDays: 7,
      recurrenceCount: 3,
    }), 201);
    expect(created.events).toHaveLength(3);
    const eventId = created.events[0].id;

    // Import a private calendar: the whole day is busy.
    const imported = await api.json<{ imported: number }>(api.upload("/api/calendar/sources/upload", {
      label: "Privat",
      file: { name: "private.ics", mimeType: "text/calendar", buffer: Buffer.from(icsAllDay(day, "Urlaub")) },
    }), 201);
    expect(imported.imported).toBe(1);

    let overview = await api.json<Overview>(api.get(`/api/calendar/overview?bandId=${bandId}&from=${day}&to=${otherDay}`));
    expect(overview.days[day].mine).toMatchObject({ status: "unavailable", source: "calendar" });
    const event = overview.events.find((entry) => entry.id === eventId)!;
    expect(event.availability.mine).toMatchObject({ status: "unavailable", source: "calendar" });

    // An explicit answer overrides the calendar.
    await api.json(api.put(`/api/events/${eventId}/availability`, { status: "available" }));
    overview = await api.json<Overview>(api.get(`/api/calendar/overview?bandId=${bandId}&from=${day}&to=${otherDay}`));
    expect(overview.events.find((entry) => entry.id === eventId)!.availability.mine).toMatchObject({ status: "available", source: "event" });

    // Manual day availability (e.g. holiday) for multiple days.
    await api.json(api.put("/api/calendar/availability", { dates: [otherDay], status: "unavailable", bandId }));
    overview = await api.json<Overview>(api.get(`/api/calendar/overview?bandId=${bandId}&from=${day}&to=${otherDay}`));
    expect(overview.days[otherDay].mine).toMatchObject({ status: "unavailable", source: "day" });

    const suggestions = await api.json<{ suggestions: Array<{ date: string; blocked: number }> }>(
      api.get(`/api/calendar/suggestions?bandId=${bandId}&days=14&startTime=19:00&endTime=22:00`),
    );
    expect(suggestions.suggestions.length).toBeGreaterThan(0);
    expect(suggestions.suggestions[0].blocked).toBe(0);

    // Edit + delete the series.
    await api.json(api.patch(`/api/events/${eventId}`, { title: "Generalprobe", scope: "series" }));
    const del = await api.json<{ deleted: number }>(api.delete(`/api/events/${eventId}?scope=series`));
    expect(del.deleted).toBe(3);
  });

  test("subscription feed is reachable without login and lists band events", async ({ baseURL }) => {
    const { api, bandId } = await registerUser(baseURL!);
    await api.json(api.post("/api/events", {
      bandId,
      title: "Release Show; Berlin",
      kind: "gig",
      startsAt: `${dateKeyInDays(20)}T18:00:00.000Z`,
      venueLabel: "SO36, Berlin",
    }), 201);

    const link = await api.json<{ url: string }>(api.get(`/api/calendar/feed-link?bandId=${bandId}`));
    const path = new URL(link.url).pathname;
    const anonymous = await ApiClient.create(baseURL!);
    const feed = await anonymous.get(path);
    expect(feed.status()).toBe(200);
    expect(feed.headers()["content-type"]).toContain("text/calendar");
    const body = await feed.text();
    expect(body).toContain("BEGIN:VEVENT");
    expect(body).toContain("Release Show\\; Berlin");

    // Resetting the link invalidates the old one.
    await api.json(api.post(`/api/calendar/feed-link?bandId=${bandId}`));
    expect((await anonymous.get(path)).status()).toBe(404);
  });

  test("calendar URLs pointing to internal addresses are refused", async ({ baseURL }) => {
    const { api } = await registerUser(baseURL!);
    const response = await api.post("/api/calendar/sources", { label: "SSRF", url: "http://127.0.0.1:5432/secret.ics" });
    expect(response.status()).toBe(400);
  });
});
