import type { Metadata } from "next";
import { Suspense } from "react";
import { SongDetailView } from "@/components/songs/song-detail";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Song") };
}

export default async function SongPage({ params }: { params: Promise<{ songId: string }> }) {
  const { songId } = await params;
  return (
    <Suspense>
      <SongDetailView key={songId} songId={songId} />
    </Suspense>
  );
}
