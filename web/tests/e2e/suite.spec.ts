import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import { ApiClient, PASSWORD, dateKeyInDays, registerUser, uniqueEmail } from "./helpers";

function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of input.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(char).toString(2).padStart(5, "0");
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}

function totp(secret: string): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const hmac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString();
  return code.padStart(6, "0");
}

test.describe("accounts & security", () => {
  test("instance config, forgot password and two-factor login", async ({ baseURL }) => {
    const anonymous = await ApiClient.create(baseURL!);
    const config = await anonymous.json<{ registrationMode: string }>(anonymous.get("/api/auth/config"));
    expect(["open", "invite", "closed"]).toContain(config.registrationMode);
    // Never reveals whether an account exists.
    await anonymous.json(anonymous.post("/api/auth/password/forgot", { email: uniqueEmail("nobody") }));

    const user = await registerUser(baseURL!);
    const setup = await user.api.json<{ secret: string; qrSvg: string }>(user.api.post("/api/account/2fa", { action: "setup" }));
    expect(setup.qrSvg).toContain("<svg");
    await user.api.json(user.api.post("/api/account/2fa", { action: "enable", code: "000000" }), 400);
    const enabled = await user.api.json<{ recoveryCodes: string[] }>(user.api.post("/api/account/2fa", { action: "enable", code: totp(setup.secret) }));
    expect(enabled.recoveryCodes).toHaveLength(10);

    const login = await ApiClient.create(baseURL!);
    const first = await login.json<{ twoFactorRequired: boolean; challenge: string }>(login.post("/api/auth/login", { email: user.email, password: PASSWORD }));
    expect(first.twoFactorRequired).toBe(true);
    await login.json(login.get("/api/auth/me"), 401);
    await login.json(login.post("/api/auth/login/2fa", { challenge: first.challenge, code: "123456" }), 401);
    await login.json(login.post("/api/auth/login/2fa", { challenge: first.challenge, code: enabled.recoveryCodes[0] }));
    const me = await login.json<{ user: { twoFactorEnabled: boolean } }>(login.get("/api/auth/me"));
    expect(me.user.twoFactorEnabled).toBe(true);

    // A recovery code works only once.
    const again = await ApiClient.create(baseURL!);
    const second = await again.json<{ challenge: string }>(again.post("/api/auth/login", { email: user.email, password: PASSWORD }));
    await again.json(again.post("/api/auth/login/2fa", { challenge: second.challenge, code: enabled.recoveryCodes[0] }), 401);
  });
});

test.describe("guests (session musicians)", () => {
  test("guest only sees the shared setlist and its songs", async ({ baseURL }) => {
    const owner = await registerUser(baseURL!, { bandName: "Guest Band" });
    const shared = await owner.api.json<{ song: { id: string } }>(owner.api.post("/api/songs", { bandId: owner.bandId, title: "Shared Song", chordProText: "[G]Hello" }), 201);
    const secret = await owner.api.json<{ song: { id: string } }>(owner.api.post("/api/songs", { bandId: owner.bandId, title: "Secret Song" }), 201);
    const setlist = await owner.api.json<{ setlist: { id: string } }>(owner.api.post("/api/setlists", { bandId: owner.bandId, name: "Gig Set", songIds: [shared.song.id] }), 201);
    const other = await owner.api.json<{ setlist: { id: string } }>(owner.api.post("/api/setlists", { bandId: owner.bandId, name: "Internal", songIds: [secret.song.id] }), 201);

    const email = uniqueEmail("guest");
    await owner.api.json(owner.api.post(`/api/bands/${owner.bandId}/invites`, { email, role: "guest", guestSetlistIds: [] }), 400);
    const invite = await owner.api.json<{ inviteToken: string }>(owner.api.post(`/api/bands/${owner.bandId}/invites`, { email, role: "guest", guestSetlistIds: [setlist.setlist.id] }), 201);
    const guest = await registerUser(baseURL!, { email, inviteToken: invite.inviteToken });
    expect(guest.bands[0].role).toBe("guest");

    const visible = await guest.api.json<{ setlists: Array<{ id: string }> }>(guest.api.get(`/api/setlists?bandId=${owner.bandId}`));
    expect(visible.setlists.map((entry) => entry.id)).toEqual([setlist.setlist.id]);
    await guest.api.json(guest.api.get(`/api/setlists/${setlist.setlist.id}`));
    await guest.api.json(guest.api.get(`/api/setlists/${other.setlist.id}`), 404);
    const song = await guest.api.json<{ song: { title: string; threads: unknown[] } }>(guest.api.get(`/api/songs/${shared.song.id}`));
    expect(song.song.title).toBe("Shared Song");
    await guest.api.json(guest.api.get(`/api/songs/${secret.song.id}`), 404);
    await guest.api.json(guest.api.get(`/api/songs?bandId=${owner.bandId}`), 403);
    await guest.api.json(guest.api.get(`/api/events?bandId=${owner.bandId}&upcoming=1`), 403);
    await guest.api.json(guest.api.get(`/api/bands/${owner.bandId}/finance`), 403);
    // Guests can follow the live mode but not lead it.
    await guest.api.json(guest.api.post(`/api/live/${setlist.setlist.id}`, { index: 0, songId: shared.song.id }), 403);
    await guest.api.json(guest.api.patch(`/api/songs/${shared.song.id}`, { title: "Hacked" }), 404);
  });
});

test.describe("music material", () => {
  test("scores, parts, import and ideas", async ({ baseURL }) => {
    const user = await registerUser(baseURL!);
    const created = await user.api.json<{ song: { id: string } }>(user.api.post("/api/songs", { bandId: user.bandId, title: "Notation Song", timeSignature: "6/8" }), 201);
    const songId = created.song.id;

    const score = await user.api.json<{ score: { id: string; data: { events: unknown[]; meter: string } } }>(user.api.post(`/api/songs/${songId}/scores`, {
      title: "Riff",
      data: { instrument: "guitar", meter: "6/8", key: "Em", tempo: 90, tab: true, events: [{ id: "a", pitches: [{ step: "E", alter: 0, octave: 3 }], duration: 8, dots: 0 }, { evil: "<script>" }] },
    }), 201);
    expect(score.score.data.meter).toBe("6/8");
    expect(score.score.data.events).toHaveLength(2); // sanitised, not rejected
    const updated = await user.api.json<{ score: { updatedAt: string; revision: number } }>(user.api.patch(`/api/songs/${songId}/scores/${score.score.id}`, { title: "Riff 2" }));
    expect(updated.score.updatedAt).toBeTruthy();
    // Concurrent edits from the same revision are merged git-like: title from one side, tempo from the other.
    const base = updated.score.revision;
    await user.api.json(user.api.patch(`/api/songs/${songId}/scores/${score.score.id}`, { title: "Riff 3", baseRevision: base }));
    const merged = await user.api.json<{ score: { title: string; data: { tempo: number } }; merge: { status: string } }>(
      user.api.patch(`/api/songs/${songId}/scores/${score.score.id}`, { data: { ...score.score.data, tempo: 100 }, baseRevision: base }),
    );
    expect(merged.merge.status).toBe("merged");
    expect(merged.score.title).toBe("Riff 3");
    expect(merged.score.data.tempo).toBe(100);

    const part = await user.api.json<{ part: { id: string } }>(user.api.put(`/api/songs/${songId}/parts`, { instrument: "Bass", kind: "tab", content: "G|---|" }));
    const parts = await user.api.json<{ parts: Array<{ instrument: string }> }>(user.api.get(`/api/songs/${songId}/parts`));
    expect(parts.parts.map((entry) => entry.instrument)).toEqual(["Bass"]);
    await user.api.json(user.api.delete(`/api/songs/${songId}/parts/${part.part.id}`));

    const imported = await user.api.json<{ created: number; skipped: number }>(user.api.post("/api/songs/import", {
      bandId: user.bandId,
      songs: [{ title: "Notation Song" }, { title: "Imported A", keySignature: "Am", tempoBpm: 120 }, { title: "Imported A" }, { title: "Imported B", chordProText: "{title: Imported B}\n[C]la" }],
    }), 201);
    expect(imported).toEqual({ created: 2, skipped: 2 });

    const idea = await user.api.json<{ idea: { id: string } }>(user.api.upload("/api/ideas", { bandId: user.bandId, title: "Riff idea", notes: "in D" }), 201);
    const ideas = await user.api.json<{ ideas: Array<{ id: string }> }>(user.api.get(`/api/ideas?bandId=${user.bandId}`));
    expect(ideas.ideas[0].id).toBe(idea.idea.id);
    const converted = await user.api.json<{ songId: string }>(user.api.post(`/api/ideas/${idea.idea.id}/convert`), 201);
    const song = await user.api.json<{ song: { title: string; notes: string } }>(user.api.get(`/api/songs/${converted.songId}`));
    expect(song.song).toMatchObject({ title: "Riff idea", notes: "in D" });

    // AI is not configured in tests → clear 501, never a crash.
    const ai = await user.api.json<{ enabled: boolean }>(user.api.get("/api/ai/status"));
    expect(ai.enabled).toBe(false);
    await user.api.json(user.api.post("/api/ai/assist", { task: "summary", bandId: user.bandId, text: "test" }), 501);
  });
});

test.describe("gigs, rehearsals & cash book", () => {
  test("protocol, planner, gig fee booking, rider pdf and finance", async ({ baseURL }) => {
    const user = await registerUser(baseURL!);
    const song = await user.api.json<{ song: { id: string } }>(user.api.post("/api/songs", { bandId: user.bandId, title: "Planned", workflowStatus: "review", durationSeconds: 200 }), 201);
    const startsAt = `${dateKeyInDays(3)}T18:00:00.000Z`;
    const rehearsal = await user.api.json<{ event: { id: string } }>(user.api.post("/api/events", { bandId: user.bandId, title: "Probe", kind: "rehearsal", startsAt, endsAt: `${dateKeyInDays(3)}T20:00:00.000Z` }), 201);
    const plan = await user.api.json<{ plan: Array<{ song: { id: string }; reasons: string[] }> }>(user.api.get(`/api/events/${rehearsal.event.id}/plan`));
    expect(plan.plan[0].song.id).toBe(song.song.id);
    expect(plan.plan[0].reasons).toContain("in Arbeit");
    const saved = await user.api.json<{ setlistId: string }>(user.api.post(`/api/events/${rehearsal.event.id}/plan`, { songIds: [song.song.id] }), 201);
    expect(saved.setlistId).toBeTruthy();

    await user.api.json(user.api.put(`/api/events/${rehearsal.event.id}/log`, {
      notes: "Bridge üben",
      songs: [{ songId: song.song.id, rating: 2, note: "zu schnell" }],
      attendance: [{ userId: user.userId, present: true }],
    }));
    const detail = await user.api.json<{ event: { log: { notes: string }; logSongs: Array<{ rating: number }> } }>(user.api.get(`/api/events/${rehearsal.event.id}/details`));
    expect(detail.event.log.notes).toBe("Bridge üben");
    expect(detail.event.logSongs[0].rating).toBe(2);

    const gig = await user.api.json<{ event: { id: string } }>(user.api.post("/api/events", { bandId: user.bandId, title: "Club Gig", kind: "gig", startsAt }), 201);
    await user.api.json(user.api.put(`/api/bands/${user.bandId}/rider`, {
      inputs: [{ channel: 1, source: "Kick", mic: "Beta 91" }],
      stagePlot: [{ id: "d", kind: "drums", label: "Drums", x: 50, y: 30 }],
      backline: "Bringen alles mit – „Umlaute“ & €",
    }));
    await user.api.json(user.api.patch(`/api/events/${gig.event.id}/details`, { feeCents: 45000, feeStatus: "paid", contactName: "Veranstalter" }));
    await user.api.json(user.api.patch(`/api/events/${gig.event.id}/details`, { feeStatus: "paid" })); // booked only once
    const pdf = await user.api.get(`/api/events/${gig.event.id}/rider`);
    expect(pdf.status()).toBe(200);
    expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

    const year = new Date(startsAt).getUTCFullYear();
    await user.api.json(user.api.post(`/api/bands/${user.bandId}/finance`, { date: `${year}-01-15`, amountCents: -12000, category: "Proberaum", description: "=Miete" }), 201);
    await user.api.json(user.api.post(`/api/bands/${user.bandId}/finance/recurring`, { amountCents: -12000, category: "Proberaum", description: "Miete", dayOfMonth: 1 }), 201);
    const finance = await user.api.json<{ balanceCents: number; transactions: Array<{ category: string }>; recurring: unknown[] }>(user.api.get(`/api/bands/${user.bandId}/finance?year=${year}`));
    expect(finance.balanceCents).toBe(45000 - 12000);
    expect(finance.transactions.filter((entry) => entry.category === "Gage")).toHaveLength(1);
    expect(finance.recurring).toHaveLength(1);
    const csv = await user.api.get(`/api/bands/${user.bandId}/finance/export?year=${year}`);
    const text = await csv.text();
    expect(text).toContain("'=Miete"); // spreadsheet formula neutralised
    expect(text).toContain("450,00");
  });
});

test.describe("public band page & live sync", () => {
  test("press kit is only public when enabled", async ({ baseURL }) => {
    const user = await registerUser(baseURL!, { bandName: "Public Band" });
    const settings = await user.api.json<{ public: { slug: string } }>(user.api.get(`/api/bands/${user.bandId}/public`));
    const slug = settings.public.slug;
    const anonymous = await ApiClient.create(baseURL!);
    await anonymous.json(anonymous.get(`/api/public/bands/${slug}`), 404);

    const song = await user.api.json<{ song: { id: string } }>(user.api.post("/api/songs", { bandId: user.bandId, title: "Single", isPublic: true }), 201);
    await user.api.json(user.api.post("/api/songs", { bandId: user.bandId, title: "Unreleased" }), 201);
    await user.api.json(user.api.post("/api/events", { bandId: user.bandId, title: "Release Show", kind: "gig", startsAt: `${dateKeyInDays(10)}T19:00:00.000Z` }), 201);
    await user.api.json(user.api.patch(`/api/bands/${user.bandId}/public`, { publicEnabled: true, bio: "Laut & schön", links: [{ label: "Instagram", url: "https://instagram.com/x" }] }));
    await user.api.json(user.api.patch(`/api/bands/${user.bandId}/public`, { links: [{ label: "bad", url: "javascript:alert(1)" }] }), 400);

    const kit = await anonymous.json<{ band: { bio: string }; songs: Array<{ title: string }>; gigs: Array<{ title: string }> }>(anonymous.get(`/api/public/bands/${slug}`));
    expect(kit.band.bio).toBe("Laut & schön");
    expect(kit.songs.map((entry) => entry.title)).toEqual(["Single"]);
    expect(kit.gigs.map((entry) => entry.title)).toEqual(["Release Show"]);
    const page = await anonymous.get(`/b/${slug}`);
    expect(page.status()).toBe(200);
    expect(await page.text()).toContain("Release Show");
    const ics = await anonymous.get(`/api/public/bands/${slug}/calendar`);
    expect(await ics.text()).toContain("BEGIN:VCALENDAR");
    await anonymous.json(anonymous.get(`/api/public/bands/${slug}/audio/${song.song.id}`), 404); // no recording yet
  });

  test("live clock and leader state", async ({ baseURL }) => {
    const user = await registerUser(baseURL!);
    const song = await user.api.json<{ song: { id: string } }>(user.api.post("/api/songs", { bandId: user.bandId, title: "Live" }), 201);
    const setlist = await user.api.json<{ setlist: { id: string } }>(user.api.post("/api/setlists", { bandId: user.bandId, name: "Live", songIds: [song.song.id] }), 201);
    const time = await user.api.json<{ serverTime: number }>(user.api.get("/api/live/time"));
    expect(Math.abs(time.serverTime - Date.now())).toBeLessThan(5000);
    await user.api.json(user.api.post(`/api/live/${setlist.setlist.id}`, {
      index: 0, songId: song.song.id,
      metronome: { running: true, bpm: 120, beatsPerBar: 4, beatUnit: 4, countInBars: 1, gridStartEpochMs: Date.now() + 500 },
    }));
    const stranger = await registerUser(baseURL!);
    await stranger.api.json(stranger.api.post(`/api/live/${setlist.setlist.id}`, { index: 0, songId: null }), 404);
  });
});
