import type { Metadata } from "next";
import { ActivityView } from "@/components/activity/activity-view";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Aktivität") };
}

export default function ActivityPage() {
  return <ActivityView />;
}
