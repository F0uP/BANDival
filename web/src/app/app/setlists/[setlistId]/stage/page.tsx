import type { Metadata } from "next";
import { StageMode } from "@/components/setlists/stage-mode";

export const metadata: Metadata = { title: "Bühnenmodus" };

export default async function StagePage({ params }: { params: Promise<{ setlistId: string }> }) {
  const { setlistId } = await params;
  return <StageMode key={setlistId} setlistId={setlistId} />;
}
