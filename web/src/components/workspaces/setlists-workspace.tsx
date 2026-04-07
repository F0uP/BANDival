import { BandivalDashboard } from "@/components/bandival-dashboard";
import { WorkspaceShell } from "@/components/workspaces/workspace-shell";

export function SetlistsWorkspace() {
  return (
    <WorkspaceShell
      title="Setlist Workspace"
      description="Dramaturgie, Reihenfolge, Stage-Modus und Rehearsal-Planung fuer jede Show."
    >
      <BandivalDashboard view="setlists" />
    </WorkspaceShell>
  );
}
