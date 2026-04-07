import { SongsWorkspace } from "@/components/workspaces/songs-workspace";

export default async function SongsPage({
  searchParams,
}: {
  searchParams: Promise<{ songId?: string }>;
}) {
  const params = await searchParams;
  return <SongsWorkspace initialSongId={params.songId ?? null} />;
}
