import { expect, test } from "@playwright/test";
import { registerUser, uniqueEmail } from "./helpers";

const SHEET = `{title: Midnight Run}
{start_of_verse: Strophe 1}
[Am]Neonlichter [F]über der Stadt
[C]keiner hier der [G]Antworten hat
{end_of_verse}

{start_of_chorus}
[F]Midnight [G]Run wir [Am]sind nicht allein
{end_of_chorus}`;

type SongResponse = { song: { chordProText: string | null; tempoBpm: string | number | null; keySignature: string | null; revision: number } };
type SaveResponse = { revision: number; merge: { status: "saved" | "merged" } | null };

/** Two band members, both editing the same song – like two people working on one file in git. */
async function bandWithTwoMembers(baseURL: string) {
  const owner = await registerUser(baseURL, { name: "Alex Owner", bandName: "Merge Band" });
  const email = uniqueEmail("member");
  const invite = await owner.api.json<{ inviteToken: string }>(owner.api.post(`/api/bands/${owner.bandId}/invites`, { email }), 201);
  const member = await registerUser(baseURL, { name: "Sam Member", email, inviteToken: invite.inviteToken });
  return { owner, member };
}

test.describe("git-like merging", () => {
  test("concurrent song edits merge, overlapping edits become a conflict that can be resolved", async ({ baseURL }) => {
    const { owner, member } = await bandWithTwoMembers(baseURL!);
    const { song } = await owner.api.json<{ song: { id: string } }>(owner.api.post("/api/songs", { bandId: owner.bandId, title: "Midnight Run", tempoBpm: 128, keySignature: "Am" }), 201);
    await owner.api.json(owner.api.patch(`/api/songs/${song.id}`, { chordProText: SHEET }));

    const start = await owner.api.json<SongResponse>(owner.api.get(`/api/songs/${song.id}`));
    const base = start.song.revision;
    expect(base).toBeGreaterThan(0);

    // Owner edits the verse, member (still on the old revision) edits the chorus and the tempo → both survive.
    const first = await owner.api.json<SaveResponse>(owner.api.patch(`/api/songs/${song.id}`, { chordProText: SHEET.replace("Neonlichter", "Neonlichter hell"), baseRevision: base }));
    expect(first.merge?.status).toBe("saved");
    const second = await member.api.json<SaveResponse>(member.api.patch(`/api/songs/${song.id}`, {
      chordProText: SHEET.replace("sind nicht allein", "sind nie allein"),
      tempoBpm: 132,
      baseRevision: base,
    }));
    expect(second.merge?.status).toBe("merged");
    const merged = await owner.api.json<SongResponse>(owner.api.get(`/api/songs/${song.id}`));
    expect(merged.song.chordProText).toContain("Neonlichter hell");
    expect(merged.song.chordProText).toContain("sind nie allein");
    expect(Number(merged.song.tempoBpm)).toBe(132);

    // Both change the same line differently → 409 with a conflict, nothing is overwritten.
    const current = merged.song.revision;
    await owner.api.json(owner.api.patch(`/api/songs/${song.id}`, { chordProText: merged.song.chordProText!.replace("[F]über der Stadt", "[F]über dem Hafen"), baseRevision: current }));
    const conflictResponse = await member.api.json<{ conflict: { id: string; labels: string[] } }>(
      member.api.patch(`/api/songs/${song.id}`, { chordProText: merged.song.chordProText!.replace("[F]über der Stadt", "[F]über der Stadt bei Nacht"), baseRevision: current }),
      409,
    );
    expect(conflictResponse.conflict.labels[0]).toBe("Lead Sheet · Strophe 1");
    const unchanged = await owner.api.json<SongResponse>(owner.api.get(`/api/songs/${song.id}`));
    expect(unchanged.song.chordProText).toContain("über dem Hafen");

    // The member is notified and sees the conflict with git-like proposals.
    const notifications = await member.api.json<{ notifications: Array<{ type: string; payload: { url?: string } | null }> }>(member.api.get("/api/notifications"));
    expect(notifications.notifications.some((entry) => entry.type === "merge_conflict" && entry.payload?.url === `/app/conflicts/${conflictResponse.conflict.id}`)).toBe(true);
    const list = await member.api.json<{ open: number }>(member.api.get("/api/merge-conflicts"));
    expect(list.open).toBe(1);
    // Other users cannot see someone else's conflict.
    await owner.api.json(owner.api.get(`/api/merge-conflicts/${conflictResponse.conflict.id}`), 404);

    const view = await member.api.json<{ items: Array<{ id: string; kind: string; options: Array<{ id: string; value: unknown }> }> }>(member.api.get(`/api/merge-conflicts/${conflictResponse.conflict.id}`));
    expect(view.items).toHaveLength(1);
    expect(view.items[0].options.map((option) => option.id)).toEqual(expect.arrayContaining(["ours", "theirs", "both-ours-first", "both-theirs-first"]));

    // Incomplete decisions are rejected, a complete one is merged and saved.
    await member.api.json(member.api.post(`/api/merge-conflicts/${conflictResponse.conflict.id}`, { action: "resolve", choices: {} }), 400);
    const resolved = await member.api.json<{ status: string }>(member.api.post(`/api/merge-conflicts/${conflictResponse.conflict.id}`, {
      action: "resolve",
      choices: { [view.items[0].id]: { option: "both-theirs-first" } },
    }));
    expect(["saved", "merged"]).toContain(resolved.status);
    const final = await owner.api.json<SongResponse>(owner.api.get(`/api/songs/${song.id}`));
    expect(final.song.chordProText).toContain("über dem Hafen");
    expect(final.song.chordProText).toContain("über der Stadt bei Nacht");
    expect((await member.api.json<{ open: number }>(member.api.get("/api/merge-conflicts"))).open).toBe(0);
  });

  test("setlist: reorder and adding songs at the same time are merged", async ({ baseURL }) => {
    const { owner, member } = await bandWithTwoMembers(baseURL!);
    const ids: string[] = [];
    for (const title of ["A", "B", "C", "D"]) {
      ids.push((await owner.api.json<{ song: { id: string } }>(owner.api.post("/api/songs", { bandId: owner.bandId, title }), 201)).song.id);
    }
    const { setlist } = await owner.api.json<{ setlist: { id: string } }>(owner.api.post("/api/setlists", { bandId: owner.bandId, name: "Show", songIds: ids.slice(0, 3) }), 201);
    const { setlist: loaded } = await owner.api.json<{ setlist: { revision: number } }>(owner.api.get(`/api/setlists/${setlist.id}`));

    await owner.api.json(owner.api.patch(`/api/setlists/${setlist.id}`, { songIds: [ids[1], ids[0], ids[2]], baseRevision: loaded.revision }));
    const second = await member.api.json<{ merge: { status: string } }>(member.api.patch(`/api/setlists/${setlist.id}`, { songIds: [ids[0], ids[1], ids[2], ids[3]], baseRevision: loaded.revision }));
    expect(second.merge.status).toBe("merged");
    const result = await owner.api.json<{ setlist: { items: Array<{ song: { id: string } }> } }>(owner.api.get(`/api/setlists/${setlist.id}`));
    expect(result.setlist.items.map((item) => item.song.id)).toEqual([ids[1], ids[0], ids[2], ids[3]]);
  });

  test("unknown or pruned base revision falls back to applying the change", async ({ baseURL }) => {
    const owner = await registerUser(baseURL!);
    const { song } = await owner.api.json<{ song: { id: string } }>(owner.api.post("/api/songs", { bandId: owner.bandId, title: "Fallback" }), 201);
    const saved = await owner.api.json<SaveResponse>(owner.api.patch(`/api/songs/${song.id}`, { keySignature: "E", baseRevision: 9999 }));
    expect(saved.merge?.status).toBe("saved");
  });
});
