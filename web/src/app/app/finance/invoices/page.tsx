import type { Metadata } from "next";
import { InvoicesView } from "@/components/finance/invoices-view";

export const metadata: Metadata = { title: "Rechnungen" };

export default function InvoicesPage() {
  return <InvoicesView />;
}
