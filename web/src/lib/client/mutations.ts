"use client";

import { useCallback } from "react";
import { useSWRConfig } from "swr";
import { api, errorMessage } from "@/lib/client/api";
import type { AvailabilityStatus } from "@/lib/client/types";
import { useToast } from "@/components/ui/feedback";

/** Revalidates every SWR key starting with one of the given prefixes. */
export function useRevalidate() {
  const { mutate } = useSWRConfig();
  return useCallback(
    (...prefixes: string[]) => mutate((key) => typeof key === "string" && prefixes.some((prefix) => key.startsWith(prefix)), undefined, { revalidate: true }),
    [mutate],
  );
}

export function useRsvp() {
  const revalidate = useRevalidate();
  const toast = useToast();
  return useCallback(async (eventId: string, status: AvailabilityStatus | null) => {
    try {
      await api.put(`/api/events/${eventId}/availability`, { status });
      await revalidate("/api/events", "/api/calendar/overview");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }, [revalidate, toast]);
}
