import type { Metadata } from "next";
import { StageMode } from "@/components/setlists/stage-mode";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Bühnenmodus") };
}

export default async function StagePage({ params }: { params: Promise<{ setlistId: string }> }) {
  const { setlistId } = await params;
  return <StageMode key={setlistId} setlistId={setlistId} />;
}
