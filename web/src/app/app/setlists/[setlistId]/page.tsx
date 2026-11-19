import type { Metadata } from "next";
import { Suspense } from "react";
import { SetlistDetailView } from "@/components/setlists/setlist-detail";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Setlist") };
}

export default async function SetlistPage({ params }: { params: Promise<{ setlistId: string }> }) {
  const { setlistId } = await params;
  return (
    <Suspense>
      <SetlistDetailView key={setlistId} setlistId={setlistId} />
    </Suspense>
  );
}
