import { BandivalDashboard } from "@/components/bandival-dashboard";

export function SongsWorkspace({ initialSongId = null }: { initialSongId?: string | null } = {}) {
  return <BandivalDashboard view="songs" initialSongId={initialSongId} />;
}
