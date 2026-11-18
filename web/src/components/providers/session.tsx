"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import useSWR from "swr";
import { api } from "@/lib/client/api";
import type { BandSummary, Me } from "@/lib/client/types";
import { roleCan, type BandAction } from "@/lib/permissions";
import { clearServiceWorkerData } from "@/components/sw-register";

const BAND_KEY = "bandival.bandId";

type SessionContextValue = {
  me: Me | null;
  isLoading: boolean;
  error: unknown;
  band: BandSummary | null;
  bandId: string | null;
  setBandId: (bandId: string) => void;
  can: (action: BandAction) => boolean;
  refresh: () => Promise<unknown>;
  logout: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

/* Active band id lives in localStorage and is shared between tabs. */
const listeners = new Set<() => void>();
function subscribeBand(callback: () => void) {
  listeners.add(callback);
  const onStorage = (event: StorageEvent) => {
    if (event.key === BAND_KEY) callback();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", onStorage);
  };
}
function readStoredBand(): string | null {
  try {
    return window.localStorage.getItem(BAND_KEY);
  } catch {
    return null;
  }
}
function writeStoredBand(bandId: string) {
  try {
    window.localStorage.setItem(BAND_KEY, bandId);
  } catch {
    // ignore (private mode)
  }
  listeners.forEach((listener) => listener());
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const { data, error, isLoading, mutate } = useSWR<{ user: Me }>("/api/auth/me", {
    revalidateOnFocus: true,
    shouldRetryOnError: false,
  });
  const storedBandId = useSyncExternalStore(subscribeBand, readStoredBand, () => null);

  const me = data?.user ?? null;
  const band = useMemo(() => {
    if (!me || me.bands.length === 0) return null;
    return me.bands.find((entry) => entry.id === storedBandId)
      ?? me.bands.find((entry) => entry.id === me.defaultBandId)
      ?? me.bands[0];
  }, [me, storedBandId]);

  const setBandId = useCallback((bandId: string) => writeStoredBand(bandId), []);

  const logout = useCallback(async () => {
    try {
      await api.post("/api/auth/logout");
    } finally {
      clearServiceWorkerData();
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload drops every cached client state on logout
      window.location.href = "/login";
    }
  }, []);

  const value = useMemo<SessionContextValue>(() => ({
    me,
    isLoading,
    error,
    band,
    bandId: band?.id ?? null,
    setBandId,
    can: (action) => roleCan(band?.role, action),
    refresh: () => mutate(),
    logout,
  }), [band, error, isLoading, logout, me, mutate, setBandId]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used inside <SessionProvider>");
  }
  return context;
}
