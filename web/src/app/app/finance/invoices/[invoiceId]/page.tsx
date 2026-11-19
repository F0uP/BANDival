import type { Metadata } from "next";
import { InvoiceEditor } from "@/components/finance/invoice-editor";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Rechnung") };
}

export default async function InvoicePage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params;
  return <InvoiceEditor key={invoiceId} invoiceId={invoiceId} />;
}
