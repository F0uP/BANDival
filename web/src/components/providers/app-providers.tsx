"use client";

import type { ReactNode } from "react";
import { SWRConfig } from "swr";
import { fetcher } from "@/lib/client/api";
import { FeedbackProvider } from "@/components/ui/feedback";
import { PlayerProvider } from "@/components/providers/player";
import { SessionProvider } from "@/components/providers/session";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher,
        revalidateOnFocus: true,
        dedupingInterval: 2000,
        errorRetryCount: 2,
        shouldRetryOnError: (error: { status?: number }) => !error?.status || error.status >= 500,
      }}
    >
      <FeedbackProvider>
        <SessionProvider>
          <PlayerProvider>{children}</PlayerProvider>
        </SessionProvider>
      </FeedbackProvider>
    </SWRConfig>
  );
}
