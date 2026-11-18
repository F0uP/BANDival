import type { Metadata } from "next";
import { ConflictsView } from "@/components/conflicts/conflicts-view";

export const metadata: Metadata = { title: "Merge-Konflikte" };

export default function ConflictsPage() {
  return <ConflictsView />;
}
