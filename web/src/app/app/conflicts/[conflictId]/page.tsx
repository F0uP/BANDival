import type { Metadata } from "next";
import { ConflictResolver } from "@/components/conflicts/conflicts-view";

export const metadata: Metadata = { title: "Merge-Konflikt" };

export default async function ConflictPage({ params }: { params: Promise<{ conflictId: string }> }) {
  const { conflictId } = await params;
  return <ConflictResolver key={conflictId} conflictId={conflictId} />;
}
