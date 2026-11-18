import type { Metadata } from "next";
import { ScorePageView } from "@/components/notation/score-page";

export const metadata: Metadata = { title: "Noten" };

export default async function ScorePage({ params }: { params: Promise<{ songId: string; scoreId: string }> }) {
  const { songId, scoreId } = await params;
  return <ScorePageView key={scoreId} songId={songId} scoreId={scoreId} />;
}
