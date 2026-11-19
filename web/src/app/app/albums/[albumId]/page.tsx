import type { Metadata } from "next";
import { AlbumDetailView } from "@/components/songs/album-detail";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Album") };
}

export default async function AlbumPage({ params }: { params: Promise<{ albumId: string }> }) {
  const { albumId } = await params;
  return <AlbumDetailView key={albumId} albumId={albumId} />;
}
