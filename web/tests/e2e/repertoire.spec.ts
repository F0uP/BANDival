import { expect, test } from "@playwright/test";
import { registerUser, toneWav } from "./helpers";

type Song = { id: string; title: string };
type Setlist = { id: string; name: string; items: Array<{ id: string; song: { id: string; title: string } }>; totalSeconds: number; instruments: string[] };

test.describe("songs, setlists & files", () => {
  test("song lifecycle with lead sheet, audio and attachments", async ({ baseURL }) => {
    const { api, bandId } = await registerUser(baseURL!);

    const { song } = await api.json<{ song: Song }>(api.post("/api/songs", {
      bandId,
      title: "Midnight Run",
      keySignature: "Am",
      tempoBpm: 128,
      durationSeconds: 215,
      spotifyUrl: "",
    }), 201);

    await api.json(api.patch(`/api/songs/${song.id}`, {
      chordProText: "{title: Midnight Run}\n[Am]Hello [F]world",
      lyricsMarkdown: "Hello world",
      workflowStatus: "approved",
    }));

    const audio = await api.json<{ audioVersion: { id: string; fileUrl: string } }>(api.upload(`/api/songs/${song.id}/audio`, {
      file: { name: "demo.wav", mimeType: "audio/wav", buffer: toneWav(4096) },
      durationSeconds: "215",
    }), 201);

    // Range requests are required for seeking in mobile audio players.
    const ranged = await api.ctx.get(audio.audioVersion.fileUrl, { headers: { Range: "bytes=0-99" } });
    expect(ranged.status()).toBe(206);
    expect(ranged.headers()["content-range"]).toBe("bytes 0-99/4096");
    expect((await ranged.body()).length).toBe(100);

    const attachment = await api.json<{ attachment: { id: string; kind: string; fileSizeBytes: string } }>(api.upload(`/api/songs/${song.id}/attachments`, {
      file: { name: "chart.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 test") },
    }), 201);
    expect(attachment.attachment.kind).toBe("score_pdf");
    expect(attachment.attachment.fileSizeBytes).toBe("13");

    const detail = await api.json<{ song: { chordProText: string; workflowStatus: string; audioVersions: unknown[]; attachments: unknown[]; lyricsRevisions: Array<{ lyricsMarkdown: string }> } }>(api.get(`/api/songs/${song.id}`));
    expect(detail.song.workflowStatus).toBe("approved");
    expect(detail.song.audioVersions).toHaveLength(1);
    expect(detail.song.attachments).toHaveLength(1);
    expect(detail.song.lyricsRevisions[0].lyricsMarkdown).toBe("Hello world");

    await api.json(api.delete(`/api/songs/${song.id}/attachments/${attachment.attachment.id}`));
    await api.json(api.delete(`/api/songs/${song.id}/audio/${audio.audioVersion.id}`));
    expect((await api.ctx.get(audio.audioVersion.fileUrl)).status()).toBe(404);
  });

  test("setlist ordering, transition notes, PDF and deleting a song that is in a setlist", async ({ baseURL }) => {
    const { api, bandId } = await registerUser(baseURL!);
    const songs: Song[] = [];
    for (const [title, duration] of [["Opener 🎸", 180], ["Ballad", 240], ["Closer", 200]] as const) {
      songs.push((await api.json<{ song: Song }>(api.post("/api/songs", { bandId, title, durationSeconds: duration }), 201)).song);
    }

    const { setlist } = await api.json<{ setlist: Setlist }>(api.post("/api/setlists", {
      bandId,
      name: "Clubshow",
      songIds: songs.map((song) => song.id),
      instruments: ["Bass", "Bass", " Drums "],
    }), 201);
    expect(setlist.items.map((item) => item.song.title)).toEqual(["Opener 🎸", "Ballad", "Closer"]);
    expect(setlist.totalSeconds).toBe(620);
    expect(setlist.instruments).toEqual(["Bass", "Drums"]);

    // Reorder (used to violate the unique (setlistId, position) constraint).
    const reversed = [...setlist.items].reverse().map((item) => item.id);
    const reordered = await api.json<{ setlist: Setlist }>(api.patch(`/api/setlists/${setlist.id}/reorder`, { orderedItemIds: reversed }));
    expect(reordered.setlist.items.map((item) => item.song.title)).toEqual(["Closer", "Ballad", "Opener 🎸"]);

    // Stale order is rejected instead of corrupting positions.
    await api.json(api.patch(`/api/setlists/${setlist.id}/reorder`, { orderedItemIds: reversed.slice(0, 2) }), 409);

    await api.json(api.patch(`/api/setlists/${setlist.id}/items/${reordered.setlist.items[0].id}`, { transitionNotes: "direkt rein" }));

    // PDF export must survive emoji in titles (WinAnsi fonts).
    const pdf = await api.ctx.get(`/api/setlists/${setlist.id}/pdf`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toContain("application/pdf");
    expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");

    // Songs that are part of a setlist can be deleted (used to fail with a FK error).
    await api.json(api.delete(`/api/songs/${songs[1].id}`));
    const after = await api.json<{ setlist: Setlist }>(api.get(`/api/setlists/${setlist.id}`));
    expect(after.setlist.items.map((item) => item.song.title)).toEqual(["Closer", "Opener 🎸"]);

    const copy = await api.json<{ setlist: Setlist }>(api.post(`/api/setlists/${setlist.id}/copy`), 201);
    expect(copy.setlist.items).toHaveLength(2);
  });

  test("songs from another band cannot be referenced", async ({ baseURL }) => {
    const a = await registerUser(baseURL!);
    const b = await registerUser(baseURL!);
    const foreign = (await a.api.json<{ song: Song }>(a.api.post("/api/songs", { bandId: a.bandId, title: "Not yours" }), 201)).song;
    await b.api.json(b.api.post("/api/setlists", { bandId: b.bandId, name: "Sneaky", songIds: [foreign.id] }), 400);
  });

  test("backup export with attachments and restore", async ({ baseURL }) => {
    const { api, bandId } = await registerUser(baseURL!);
    const { song } = await api.json<{ song: Song }>(api.post("/api/songs", { bandId, title: "Backup me" }), 201);
    await api.json(api.upload(`/api/songs/${song.id}/attachments`, {
      file: { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") },
    }), 201);

    // Export used to crash because of BigInt file sizes.
    const backup = await api.json<{ data: { songs: Array<{ title: string }>; attachments: unknown[] } }>(api.get(`/api/bands/${bandId}/backup`));
    expect(backup.data.songs.map((entry) => entry.title)).toContain("Backup me");
    expect(backup.data.attachments).toHaveLength(1);

    await api.json(api.delete(`/api/songs/${song.id}`));
    await api.json(api.post(`/api/bands/${bandId}/backup`, backup));

    const songs = await api.json<{ songs: Song[] }>(api.get(`/api/songs?bandId=${bandId}`));
    expect(songs.songs.map((entry) => entry.title)).toContain("Backup me");
  });

  test("tasks board", async ({ baseURL }) => {
    const { api, bandId } = await registerUser(baseURL!);
    const { song } = await api.json<{ song: Song }>(api.post("/api/songs", { bandId, title: "Tasky" }), 201);
    const { task } = await api.json<{ task: { id: string } }>(api.post("/api/boards/tasks", { bandId, songId: song.id, title: "Bridge üben" }), 201);
    await api.json(api.patch("/api/boards/tasks", { taskId: task.id, status: "done" }));
    const active = await api.json<{ tasks: unknown[] }>(api.get(`/api/boards/tasks?bandId=${bandId}&status=active`));
    expect(active.tasks).toHaveLength(0);
  });
});
