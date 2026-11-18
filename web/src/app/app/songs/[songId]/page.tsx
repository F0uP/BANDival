import type { Metadata } from "next";
import { Suspense } from "react";
import { SongDetailView } from "@/components/songs/song-detail";

export const metadata: Metadata = { title: "Song" };

export default async function SongPage({ params }: { params: Promise<{ songId: string }> }) {
  const { songId } = await params;
  return (
    <Suspense>
      <SongDetailView key={songId} songId={songId} />
    </Suspense>
  );
}
