import { expect, request, test } from "@playwright/test";
import { ApiClient, dateKeyInDays, registerUser } from "./helpers";

type Song = { id: string };
type Event = { id: string };

async function bandWithGig(baseURL: string) {
  const user = await registerUser(baseURL, { bandName: "The Feature Band" });
  const { api, bandId } = user;
  const songs: Song[] = [];
  for (const [title, extra] of [
    ["Opener", { tempoBpm: 120, durationSeconds: 12, timeSignature: "4/4" }],
    ["Ballad", { durationSeconds: 200 }],
  ] as const) {
    songs.push((await api.json<{ song: Song }>(api.post("/api/songs", { bandId, title, ...extra }), 201)).song);
  }
  await api.json(api.patch(`/api/songs/${songs[0].id}`, { composers: "Alex Weber", lyricists: "Kim Brandt", publisher: "", gemaWorkNumber: "1234567-001" }));
  const { setlist } = await api.json<{ setlist: { id: string } }>(api.post("/api/setlists", { bandId, name: "Club Set", songIds: songs.map((song) => song.id) }), 201);
  const day = dateKeyInDays(10);
  const { event: gig } = await api.json<{ event: Event }>(api.post("/api/events", {
    bandId, title: "Club Gig", kind: "gig", startsAt: `${day}T19:00:00.000Z`, endsAt: `${day}T21:00:00.000Z`, venueLabel: "Molotow, Hamburg", setlistId: setlist.id,
  }), 201);
  await api.json(api.patch(`/api/events/${gig.id}/details`, { feeCents: 50000, contactName: "Kim", loadInAt: `${day}T15:00:00.000Z`, soundcheckAt: `${day}T16:30:00.000Z` }));
  return { ...user, songs, setlist, gig, day };
}

test.describe("band features", () => {
  test("GEMA set list from the gig's setlist with rights data", async ({ baseURL }) => {
    const { api, gig, songs } = await bandWithGig(baseURL!);
    const song = await api.json<{ song: { composers: string; gemaWorkNumber: string } }>(api.get(`/api/songs/${songs[0].id}`));
    expect(song.song.composers).toBe("Alex Weber");
    expect(song.song.gemaWorkNumber).toBe("1234567-001");

    const { gema } = await api.json<{ gema: { source: string; rows: Array<{ title: string; composers: string; incomplete: boolean }> } }>(api.get(`/api/events/${gig.id}/gema`));
    expect(gema.source).toBe("setlist");
    expect(gema.rows.map((row) => row.title)).toEqual(["Opener", "Ballad"]);
    expect(gema.rows.map((row) => row.incomplete)).toEqual([false, true]);

    const csv = await api.get(`/api/events/${gig.id}/gema?format=csv`);
    const text = await csv.text();
    expect(text).toContain("Nr.;Titel;Komponist;Textdichter;Verlag;GEMA-Werknummer;Dauer");
    expect(text).toContain("1;Opener;Alex Weber;Kim Brandt;;1234567-001;0:12");
    const pdf = await api.get(`/api/events/${gig.id}/gema?format=pdf`);
    expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

    // Once the minutes say what was played, that list wins
    await api.json(api.put(`/api/events/${gig.id}/log`, { notes: "", songs: [{ songId: songs[1].id, rating: 4 }], attendance: [] }));
    const played = await api.json<{ gema: { source: string; rows: Array<{ title: string }> } }>(api.get(`/api/events/${gig.id}/gema`));
    expect(played.gema.source).toBe("played");
    expect(played.gema.rows.map((row) => row.title)).toEqual(["Ballad"]);
  });

  test("public tech-rider link works without login and can be revoked", async ({ baseURL }) => {
    const { api, bandId, gig } = await bandWithGig(baseURL!);
    await api.json(api.put(`/api/bands/${bandId}/rider`, { inputs: [{ channel: 1, source: "Kick", mic: "Beta 91" }], monitors: [{ mix: 1, who: "Vocals" }] }));
    const { share } = await api.json<{ share: { id: string; url: string } }>(api.post(`/api/bands/${bandId}/rider/shares`, { eventId: gig.id }), 201);
    const again = await api.json<{ share: { id: string } }>(api.post(`/api/bands/${bandId}/rider/shares`, { eventId: gig.id }), 201);
    expect(again.share.id).toBe(share.id); // one link per gig
    const token = share.url.split("/r/")[1];

    const anonymous = await ApiClient.create(baseURL!);
    const page = await anonymous.get(`/r/${token}`);
    expect(page.status()).toBe(200);
    const html = await page.text();
    expect(html).toContain("The Feature Band");
    expect(html).toContain("Beta 91");
    expect(html).toContain("Molotow, Hamburg");
    const pdf = await anonymous.get(`/api/public/rider/${token}`);
    expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
    await anonymous.json(anonymous.post(`/api/bands/${bandId}/rider/shares`, { eventId: gig.id }), 401);

    const list = await api.json<{ shares: Array<{ lastViewedAt: string | null }> }>(api.get(`/api/bands/${bandId}/rider/shares?eventId=${gig.id}`));
    expect(list.shares[0].lastViewedAt).toBeTruthy();
    await api.json(api.delete(`/api/bands/${bandId}/rider/shares/${share.id}`));
    expect((await anonymous.get(`/api/public/rider/${token}`)).status()).toBe(404);
    expect(await (await anonymous.get(`/r/${token}`)).text()).toContain("Link ungültig");
    expect((await anonymous.get("/api/public/rider/not-a-real-token-at-all-123")).status()).toBe(404);
  });

  test("invoices can be written in English", async ({ baseURL }) => {
    const { api, bandId, gig } = await bandWithGig(baseURL!);
    const { invoice } = await api.json<{ invoice: { id: string; language: string; items: Array<{ description: string; unit: string }> } }>(api.post(`/api/bands/${bandId}/invoices`, { eventId: gig.id }), 201);
    expect(invoice.language).toBe("de");
    expect(invoice.items[0].description).toContain("Live-Auftritt „Club Gig“");
    const english = await api.json<{ invoice: { language: string; items: Array<{ description: string; unit: string }> } }>(api.patch(`/api/invoices/${invoice.id}`, { language: "en" }));
    expect(english.invoice.language).toBe("en");
    expect(english.invoice.items[0].description).toContain("Live performance “Club Gig”");
    expect(english.invoice.items[0].unit).toBe("flat rate");
    const pdf = await api.get(`/api/invoices/${invoice.id}/pdf`);
    expect(pdf.headers()["content-disposition"]).toContain("Invoice-Draft");
    expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
    const back = await api.json<{ invoice: { items: Array<{ description: string }> } }>(api.patch(`/api/invoices/${invoice.id}`, { language: "de" }));
    expect(back.invoice.items[0].description).toContain("Live-Auftritt");
  });

  test("click tracks for a song and a whole set", async ({ baseURL }) => {
    const { api, songs, setlist } = await bandWithGig(baseURL!);
    const click = await api.get(`/api/songs/${songs[0].id}/click?countIn=1`);
    expect(click.status()).toBe(200);
    expect(click.headers()["content-type"]).toMatch(/audio\/(mpeg|wav)/);
    expect((await click.body()).length).toBeGreaterThan(1000);
    await api.json(api.get(`/api/songs/${songs[1].id}/click`), 400); // no tempo
    const set = await api.get(`/api/setlists/${setlist.id}/click?gap=2`);
    expect(set.status()).toBe(200);
    expect(set.headers()["content-disposition"]).toContain("Club-Set-click");
  });

  test("tour planning with gigs, travel and itinerary", async ({ baseURL }) => {
    const { api, bandId, gig, day } = await bandWithGig(baseURL!);
    const { tour } = await api.json<{ tour: { id: string } }>(api.post(`/api/bands/${bandId}/tours`, { name: "Herbsttour", startsOn: day, endsOn: dateKeyInDays(12) }), 201);
    await api.json(api.post(`/api/tours/${tour.id}/items`, {
      kind: "travel", title: "Sprinter", startsAt: `${day}T09:00:00.000Z`, endsAt: `${day}T11:00:00.000Z`, location: "Hamburg", toLocation: "Kiel", distanceKm: 95, costCents: 4500,
    }), 201);
    await api.json(api.post(`/api/tours/${tour.id}/items`, { kind: "accommodation", title: "Hotel Am Hafen", startsAt: `${day}T22:30:00.000Z`, endsAt: `${dateKeyInDays(11)}T09:00:00.000Z`, bookingRef: "AB-1" }), 201);
    await api.json(api.post(`/api/tours/${tour.id}/items`, { kind: "travel", title: "x", startsAt: `${day}T12:00:00.000Z`, endsAt: `${day}T10:00:00.000Z` }), 400);

    const detail = await api.json<{ events: Array<{ id: string }>; items: unknown[]; totals: { gigs: number; distanceKm: number; costCents: number; feeCents: number; days: number } }>(api.get(`/api/tours/${tour.id}`));
    expect(detail.events.map((event) => event.id)).toEqual([gig.id]); // gig in the period was assigned automatically
    expect(detail.totals).toMatchObject({ gigs: 1, distanceKm: 95, costCents: 4500, feeCents: 50000, days: 3 });
    const list = await api.json<{ tours: Array<{ id: string; gigs: number; venues: string[] }> }>(api.get(`/api/bands/${bandId}/tours`));
    expect(list.tours[0]).toMatchObject({ id: tour.id, gigs: 1, venues: ["Molotow, Hamburg"] });

    const pdf = await api.get(`/api/tours/${tour.id}/pdf`);
    expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

    await api.json(api.put(`/api/tours/${tour.id}/events`, { eventIds: [] }));
    expect((await api.json<{ events: unknown[] }>(api.get(`/api/tours/${tour.id}`))).events).toHaveLength(0);

    const stranger = await registerUser(baseURL!);
    await stranger.api.json(stranger.api.get(`/api/tours/${tour.id}`), 404);
    await stranger.api.json(stranger.api.put(`/api/tours/${tour.id}/events`, { eventIds: [gig.id] }), 404);

    await api.json(api.delete(`/api/tours/${tour.id}`));
    const event = await api.json<{ event: { id: string; tourId: string | null } }>(api.get(`/api/events/${gig.id}/details`));
    expect(event.event.id).toBe(gig.id); // the gig survives
  });

  test("the account remembers the UI language for background messages", async ({ baseURL }) => {
    const { api } = await registerUser(baseURL!);
    const session = (await api.ctx.storageState()).cookies.find((cookie) => cookie.name === "bandival_session")!;
    const host = new URL(baseURL!).hostname;
    // Browser with English selected → stored on the account
    const english = await request.newContext({
      baseURL,
      storageState: { cookies: [session, { name: "bandival_locale", value: "en", domain: host, path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" }], origins: [] },
    });
    expect((await english.get("/api/auth/me")).ok()).toBeTruthy();
    // A new device without a language cookie takes over the stored language
    const fresh = await request.newContext({ baseURL, storageState: { cookies: [session], origins: [] } });
    const me = await fresh.get("/api/auth/me");
    expect(me.headers()["set-cookie"] ?? "").toContain("bandival_locale=en");
  });
});
