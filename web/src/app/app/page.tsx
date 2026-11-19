import type { Metadata } from "next";
import { Dashboard } from "@/components/dashboard/dashboard";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Übersicht") };
}

export default function AppHomePage() {
  return <Dashboard />;
}
