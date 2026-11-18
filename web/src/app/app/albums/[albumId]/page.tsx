import type { Metadata } from "next";
import { AlbumDetailView } from "@/components/songs/album-detail";

export const metadata: Metadata = { title: "Album" };

export default async function AlbumPage({ params }: { params: Promise<{ albumId: string }> }) {
  const { albumId } = await params;
  return <AlbumDetailView key={albumId} albumId={albumId} />;
}
