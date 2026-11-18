import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AuthError, requireAuthUser, requireBandAction, requireBandMembership } from "@/lib/auth";
import { aiComplete, parseAiJson } from "@/lib/ai";
import { errorResponse } from "@/lib/http";
import { consumeRateLimit } from "@/lib/rate-limit";

const schema = z.discriminatedUnion("task", [
  z.object({ task: z.literal("chordpro"), bandId: z.string().uuid(), text: z.string().min(1).max(20000) }),
  z.object({ task: z.literal("setlist_order"), bandId: z.string().uuid(), setlistId: z.string().uuid(), goal: z.string().max(300).optional() }),
  z.object({ task: z.literal("bio"), bandId: z.string().uuid(), notes: z.string().max(3000).optional(), language: z.enum(["de", "en"]).default("de") }),
  z.object({ task: z.literal("summary"), bandId: z.string().uuid(), text: z.string().min(1).max(20000) }),
]);

const SYSTEM = "Du bist ein hilfsbereiter Assistent für Bands und Musiker:innen in der App Bandival. Antworte präzise, ohne Floskeln.";

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const payload = schema.parse(await request.json());
    await requireBandMembership(session.userId, payload.bandId);
    await consumeRateLimit(`ai:${session.userId}`, 30, 60 * 60 * 1000);

    if (payload.task === "chordpro") {
      const result = await aiComplete({
        system: `${SYSTEM} Du wandelst Songtexte mit Akkorden in sauberes ChordPro um.`,
        prompt: `Wandle den folgenden Text in ChordPro um. Regeln:
- Akkorde, die über einer Textzeile stehen, wandern in eckigen Klammern exakt an die passende Silbe: [Am]Text.
- Abschnittsüberschriften (Strophe, Refrain, Bridge, Intro …) als {start_of_verse}/{start_of_chorus}/{comment: …} kennzeichnen.
- Titel/Tonart nur übernehmen, wenn sie im Text stehen ({title: …}, {key: …}).
- Keine Akkorde oder Wörter erfinden, nichts weglassen.
Gib NUR das ChordPro zurück, ohne Erklärung und ohne Codeblock.

${payload.text}`,
        temperature: 0.1,
      });
      return NextResponse.json({ chordPro: result.replace(/^```\w*\s*/, "").replace(/```\s*$/, "").trim() });
    }

    if (payload.task === "setlist_order") {
      const setlist = await prisma.setlist.findFirst({
        where: { id: payload.setlistId, bandId: payload.bandId },
        include: { items: { orderBy: { position: "asc" }, include: { song: { select: { id: true, title: true, keySignature: true, tempoBpm: true, durationSeconds: true, notes: true } } } } },
      });
      if (!setlist) throw new AuthError("Setlist nicht gefunden.", 404);
      const songs = setlist.items.map((item) => ({
        id: item.song.id,
        title: item.song.title,
        key: item.song.keySignature,
        bpm: item.song.tempoBpm ? Number(item.song.tempoBpm) : null,
        seconds: item.song.durationSeconds,
        notes: item.song.notes?.slice(0, 160) ?? null,
      }));
      const text = await aiComplete({
        system: `${SYSTEM} Du bist erfahrene:r Live-Musiker:in und planst Setlist-Dramaturgie.`,
        prompt: `Schlage eine Reihenfolge für diese Setlist vor. Ziel: ${payload.goal || "starker Opener, Spannungsbogen, Abwechslung bei Tempo und Tonart, sinnvolle Übergänge (verwandte Tonarten), starkes Finale/Zugabe am Ende"}.
Antworte als JSON: {"order": ["<song id>", …alle IDs genau einmal…], "reasoning": "<2–4 Sätze auf Deutsch>", "transitions": [{"songId": "<id>", "note": "<kurzer Übergangstipp>"}]}

Songs:
${JSON.stringify(songs)}`,
        json: true,
        temperature: 0.5,
      });
      const parsed = parseAiJson<{ order?: string[]; reasoning?: string; transitions?: Array<{ songId: string; note: string }> }>(text);
      const known = new Set(songs.map((song) => song.id));
      const order = Array.from(new Set((parsed.order ?? []).filter((id) => known.has(id))));
      for (const song of songs) if (!order.includes(song.id)) order.push(song.id);
      return NextResponse.json({
        order,
        reasoning: parsed.reasoning ?? "",
        transitions: (parsed.transitions ?? []).filter((entry) => known.has(entry.songId)).map((entry) => ({ songId: entry.songId, note: String(entry.note).slice(0, 200) })),
      });
    }

    if (payload.task === "bio") {
      await requireBandAction(session.userId, payload.bandId, "public.manage");
      const band = await prisma.band.findUnique({
        where: { id: payload.bandId },
        select: { name: true, description: true, genre: true, city: true, bio: true, songs: { where: { isPublic: true }, select: { title: true }, take: 12 } },
      });
      if (!band) throw new AuthError("Band nicht gefunden.", 404);
      const bio = await aiComplete({
        system: `${SYSTEM} Du schreibst Pressetexte (EPK) für Bands – lebendig, konkret, ohne Übertreibungen und ohne erfundene Fakten.`,
        prompt: `Schreibe eine Band-Bio (ca. 120–180 Wörter, ${payload.language === "en" ? "auf Englisch" : "auf Deutsch"}) für das Pressekit.
Band: ${band.name}
Genre: ${band.genre ?? "–"}
Stadt: ${band.city ?? "–"}
Beschreibung: ${band.description ?? "–"}
Bisherige Bio: ${band.bio ?? "–"}
Songs: ${band.songs.map((song) => song.title).join(", ") || "–"}
Stichpunkte der Band: ${payload.notes ?? "–"}
Erfinde keine Auszeichnungen, Labels oder Konzerte. Nur den Text, ohne Überschrift.`,
        temperature: 0.7,
      });
      return NextResponse.json({ bio });
    }

    const summary = await aiComplete({
      system: `${SYSTEM} Du fasst Probenprotokolle und Diskussionen für Bands zusammen.`,
      prompt: `Fasse zusammen (Deutsch, Markdown-Liste): 1) Was lief gut, 2) Was muss geübt werden (mit Songtitel), 3) Konkrete nächste Schritte mit Verantwortlichen, falls genannt. Maximal 12 Punkte.

${payload.text}`,
      temperature: 0.3,
    });
    return NextResponse.json({ summary });
  } catch (error) {
    return errorResponse(error, "KI-Anfrage fehlgeschlagen.");
  }
}
