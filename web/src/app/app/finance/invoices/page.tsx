import type { Metadata } from "next";
import { InvoicesView } from "@/components/finance/invoices-view";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Rechnungen") };
}

export default function InvoicesPage() {
  return <InvoicesView />;
}
