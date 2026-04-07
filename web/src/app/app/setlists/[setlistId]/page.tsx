import { SetlistsWorkspace } from "@/components/workspaces/setlists-workspace";

export default async function SetlistDetailPage({ params }: { params: Promise<{ setlistId: string }> }) {
  const { setlistId } = await params;
  return <SetlistsWorkspace initialSetlistId={setlistId} />;
}
