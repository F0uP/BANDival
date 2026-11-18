import type { Metadata } from "next";
import { InvoiceEditor } from "@/components/finance/invoice-editor";

export const metadata: Metadata = { title: "Rechnung" };

export default async function InvoicePage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params;
  return <InvoiceEditor key={invoiceId} invoiceId={invoiceId} />;
}
