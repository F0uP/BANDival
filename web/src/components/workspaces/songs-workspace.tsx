import { BandivalDashboard } from "@/components/bandival-dashboard";
import { WorkspaceShell } from "@/components/workspaces/workspace-shell";

export function SongsWorkspace() {
  return (
    <WorkspaceShell
      title="Song Workspace"
      description="Kompositionen, Lyrics, Audio-Versionen und Noten in einem fokussierten Arbeitsbereich."
    >
      <BandivalDashboard view="songs" />
    </WorkspaceShell>
  );
}
