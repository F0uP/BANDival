import type { Metadata } from "next";
import { ScorePageView } from "@/components/notation/score-page";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Noten") };
}

export default async function ScorePage({ params }: { params: Promise<{ songId: string; scoreId: string }> }) {
  const { songId, scoreId } = await params;
  return <ScorePageView key={scoreId} songId={songId} scoreId={scoreId} />;
}
