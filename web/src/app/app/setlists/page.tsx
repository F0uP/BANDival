import type { Metadata } from "next";
import { Suspense } from "react";
import { SetlistsView } from "@/components/setlists/setlists-view";

export const metadata: Metadata = { title: "Setlists" };

export default function SetlistsPage() {
  return (
    <Suspense>
      <SetlistsView />
    </Suspense>
  );
}
