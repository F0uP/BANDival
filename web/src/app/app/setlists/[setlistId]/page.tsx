import type { Metadata } from "next";
import { Suspense } from "react";
import { SetlistDetailView } from "@/components/setlists/setlist-detail";

export const metadata: Metadata = { title: "Setlist" };

export default async function SetlistPage({ params }: { params: Promise<{ setlistId: string }> }) {
  const { setlistId } = await params;
  return (
    <Suspense>
      <SetlistDetailView key={setlistId} setlistId={setlistId} />
    </Suspense>
  );
}
