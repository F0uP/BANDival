import { BandivalDashboard } from "@/components/bandival-dashboard";
import { WorkspaceShell } from "@/components/workspaces/workspace-shell";

export function CalendarWorkspace() {
  return (
    <WorkspaceShell
      title="Calendar Workspace"
      description="Tour-/Probetermine mit Verfuegbarkeiten, Konflikten und Serien-Events."
    >
      <BandivalDashboard view="calendar" />
    </WorkspaceShell>
  );
}
