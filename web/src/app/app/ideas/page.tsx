import type { Metadata } from "next";
import { Suspense } from "react";
import { IdeasView } from "@/components/ideas/ideas-view";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Ideen") };
}

export default function IdeasPage() {
  return (
    <Suspense>
      <IdeasView />
    </Suspense>
  );
}
