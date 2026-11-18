import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AuthError, assertSetlistAccess, getBandRole, requireAuthUser } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse } from "@/lib/http";
import { currentState, publish, subscribe, type LiveState } from "@/lib/live-hub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ setlistId: string }> };

/** Server-Sent Events stream with the live state of a setlist (members and guests). */
export async function GET(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const setlistId = parseUuid((await context.params).setlistId, "Setlist-ID");
    await assertSetlistAccess(session.userId, setlistId, { allowGuest: true });
    const user = await prisma.appUser.findUnique({ where: { id: session.userId }, select: { displayName: true } });

    const encoder = new TextEncoder();
    let cleanup: (() => void) | null = null;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (event: string, data: unknown) => {
          try {
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
          } catch {
            cleanup?.();
          }
        };
        const unsubscribe = subscribe(setlistId, { userId: session.userId, displayName: user?.displayName ?? "?", send });
        const heartbeat = setInterval(() => send("ping", { serverTime: Date.now() }), 20_000);
        cleanup = () => {
          clearInterval(heartbeat);
          unsubscribe();
          cleanup = null;
        };
        request.signal.addEventListener("abort", () => {
          cleanup?.();
          try {
            controller.close();
          } catch {
            // already closed
          }
        });
      },
      cancel() {
        cleanup?.();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

const metronomeSchema = z.object({
  running: z.boolean(),
  bpm: z.number().min(20).max(400),
  beatsPerBar: z.number().int().min(1).max(16),
  beatUnit: z.number().int().min(1).max(16),
  countInBars: z.number().int().min(0).max(4),
  gridStartEpochMs: z.number(),
}).nullable();

const publishSchema = z.object({
  index: z.number().int().min(0).max(500),
  songId: z.string().uuid().nullable(),
  metronome: metronomeSchema.optional(),
  message: z.string().trim().max(140).nullable().optional(),
  /** Leader leaves: clears the shared state. */
  end: z.boolean().optional(),
});

/** Leader publishes the current song / metronome. Guests can follow but not lead. */
export async function POST(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const setlistId = parseUuid((await context.params).setlistId, "Setlist-ID");
    const { bandId } = await assertSetlistAccess(session.userId, setlistId, { allowGuest: true });
    if ((await getBandRole(session.userId, bandId)) === "guest") {
      throw new AuthError("Gäste können der Live-Steuerung nur folgen.", 403);
    }
    const payload = publishSchema.parse(await request.json());
    const previous = currentState(setlistId);
    if (payload.end) {
      if (!previous || previous.leaderId === session.userId) publish(setlistId, null);
      return NextResponse.json({ ok: true });
    }
    const user = await prisma.appUser.findUnique({ where: { id: session.userId }, select: { displayName: true } });
    const state: LiveState = {
      index: payload.index,
      songId: payload.songId,
      leaderId: session.userId,
      leaderName: user?.displayName ?? "Leader",
      metronome: payload.metronome === undefined ? previous?.metronome ?? null : payload.metronome,
      message: payload.message === undefined ? previous?.message ?? null : payload.message,
      updatedAt: Date.now(),
    };
    publish(setlistId, state);
    return NextResponse.json({ ok: true, serverTime: Date.now() });
  } catch (error) {
    return errorResponse(error);
  }
}
