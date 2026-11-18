import type { Metadata } from "next";
import { Suspense } from "react";
import { IdeasView } from "@/components/ideas/ideas-view";

export const metadata: Metadata = { title: "Ideen" };

export default function IdeasPage() {
  return (
    <Suspense>
      <IdeasView />
    </Suspense>
  );
}
