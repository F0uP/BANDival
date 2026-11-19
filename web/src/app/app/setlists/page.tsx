import type { Metadata } from "next";
import { Suspense } from "react";
import { SetlistsView } from "@/components/setlists/setlists-view";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Setlists") };
}

export default function SetlistsPage() {
  return (
    <Suspense>
      <SetlistsView />
    </Suspense>
  );
}
