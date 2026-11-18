"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import type { LiveState } from "@/lib/live-hub";

export type { LiveState };

/**
 * NTP-style clock offset (server − local): several round trips, the ones with the lowest round-trip time win.
 * Accurate to a few milliseconds on a LAN.
 */
async function measureOffset(samples = 6): Promise<{ offset: number; rtt: number } | null> {
  const results: Array<{ offset: number; rtt: number }> = [];
  for (let index = 0; index < samples; index += 1) {
    const sent = performance.now();
    try {
      const response = await fetch("/api/live/time", { cache: "no-store", credentials: "same-origin" });
      const received = performance.now();
      const receivedWall = Date.now();
      const { serverTime } = (await response.json()) as { serverTime: number };
      const rtt = received - sent;
      const localAtMid = receivedWall - rtt / 2;
      results.push({ offset: serverTime - localAtMid, rtt });
    } catch {
      return results.length ? results.sort((a, b) => a.rtt - b.rtt)[0] : null;
    }
  }
  const best = results.sort((a, b) => a.rtt - b.rtt).slice(0, 3);
  return { offset: best.reduce((sum, entry) => sum + entry.offset, 0) / best.length, rtt: best[0].rtt };
}

/**
 * Live stage sync via the Bandival server (Server-Sent Events). Always connected while the live mode is open;
 * whoever starts the click leads and everybody else follows automatically.
 * (The Android app additionally syncs offline via Bluetooth/Wi-Fi without any server.)
 */
export function useLiveSync(setlistId: string, enabled: boolean, onRemoteState: (state: LiveState | null, clockOffsetMs: number) => void) {
  const [connected, setConnected] = useState(false);
  const [presence, setPresence] = useState<Array<{ userId: string; displayName: string }>>([]);
  const [remote, setRemote] = useState<LiveState | null>(null);
  const [accuracyMs, setAccuracyMs] = useState<number | null>(null);
  const offsetRef = useRef(0);
  const callbackRef = useRef(onRemoteState);

  useEffect(() => {
    callbackRef.current = onRemoteState;
  }, [onRemoteState]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const sync = async () => {
      const result = await measureOffset();
      if (cancelled || !result) return;
      offsetRef.current = result.offset;
      setAccuracyMs(Math.max(1, Math.round(result.rtt / 2)));
    };
    void sync();
    const interval = window.setInterval(() => void sync(), 30_000);

    const source = new EventSource(`/api/live/${setlistId}`, { withCredentials: true });
    source.addEventListener("open", () => setConnected(true));
    source.addEventListener("error", () => setConnected(false));
    source.addEventListener("hello", (event) => {
      const data = JSON.parse((event as MessageEvent).data) as { serverTime: number; state: LiveState | null };
      setConnected(true);
      setRemote(data.state);
      callbackRef.current(data.state, offsetRef.current);
    });
    source.addEventListener("presence", (event) => setPresence(JSON.parse((event as MessageEvent).data)));
    source.addEventListener("state", (event) => {
      const state = JSON.parse((event as MessageEvent).data) as LiveState | null;
      setRemote(state);
      callbackRef.current(state, offsetRef.current);
    });
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      source.close();
      setConnected(false);
    };
  }, [enabled, setlistId]);

  const publish = useCallback(async (state: { index: number; songId: string | null; metronome?: LiveState["metronome"]; message?: string | null; end?: boolean }) => {
    // Local wall-clock timestamps → server time, so followers can align their beat grid.
    const metronome = state.metronome ? { ...state.metronome, gridStartEpochMs: state.metronome.gridStartEpochMs + offsetRef.current } : state.metronome;
    await api.post(`/api/live/${setlistId}`, { ...state, metronome }).catch(() => undefined);
  }, [setlistId]);

  return { connected, presence, remote, publish, accuracyMs };
}
