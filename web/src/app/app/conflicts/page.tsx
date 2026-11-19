import type { Metadata } from "next";
import { ConflictsView } from "@/components/conflicts/conflicts-view";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Merge-Konflikte") };
}

export default function ConflictsPage() {
  return <ConflictsView />;
}
