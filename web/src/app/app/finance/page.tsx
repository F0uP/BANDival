import type { Metadata } from "next";
import { FinanceView } from "@/components/finance/finance-view";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Bandkasse") };
}

export default function FinancePage() {
  return <FinanceView />;
}
