import type { Metadata } from "next";
import { ConflictResolver } from "@/components/conflicts/conflicts-view";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Merge-Konflikt") };
}

export default async function ConflictPage({ params }: { params: Promise<{ conflictId: string }> }) {
  const { conflictId } = await params;
  return <ConflictResolver key={conflictId} conflictId={conflictId} />;
}
