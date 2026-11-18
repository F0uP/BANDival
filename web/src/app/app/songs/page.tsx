import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SongsView } from "@/components/songs/songs-view";

export const metadata: Metadata = { title: "Songs" };

export default async function SongsPage({ searchParams }: { searchParams: Promise<{ songId?: string }> }) {
  const { songId } = await searchParams;
  // Legacy deep links (/app/songs?songId=…) from older notifications.
  if (songId && /^[0-9a-f-]{36}$/i.test(songId)) {
    redirect(`/app/songs/${songId}`);
  }

  return (
    <Suspense>
      <SongsView />
    </Suspense>
  );
}
