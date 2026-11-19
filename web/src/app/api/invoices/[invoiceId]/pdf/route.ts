import { NextRequest, NextResponse } from "next/server";
import { parseUuid } from "@/lib/api";
import { errorResponse } from "@/lib/http";
import { parseInvoiceSettings, renderInvoicePdf } from "@/lib/invoice";
import { bandInvoiceSettings, invoiceParts, loadInvoiceForUser } from "@/lib/invoices-server";

export const runtime = "nodejs";

/** Invoice PDF – drafts carry an "ENTWURF" watermark; issued invoices use the frozen issuer data. */
export async function GET(request: NextRequest, context: { params: Promise<{ invoiceId: string }> }) {
  try {
    const { invoice } = await loadInvoiceForUser(request, parseUuid((await context.params).invoiceId, "Rechnungs-ID"), "finance.view");
    const current = await bandInvoiceSettings(invoice.bandId);
    const issuer = invoice.status === "draft" || !invoice.issuer ? current : parseInvoiceSettings(invoice.issuer, current.bandName);
    const { recipient, items } = invoiceParts(invoice);
    const bytes = await renderInvoicePdf({
      number: invoice.number,
      status: invoice.status,
      issueDate: invoice.issueDate,
      serviceDate: invoice.serviceDate,
      serviceDateTo: invoice.serviceDateTo,
      dueDate: invoice.dueDate ?? (invoice.status === "draft" ? new Date(Date.now() + current.paymentTermDays * 86_400_000) : null),
      recipient,
      items,
      intro: invoice.intro,
      notes: invoice.notes,
      smallBusiness: invoice.status === "draft" ? current.smallBusiness : invoice.smallBusiness,
      reverseCharge: invoice.reverseCharge,
      cancelsNumber: invoice.cancelsNumber,
      issuer,
      language: invoice.language === "en" ? "en" : "de",
    });
    const english = invoice.language === "en";
    const name = `${invoice.cancelsNumber ? (english ? "Cancellation" : "Stornorechnung") : english ? "Invoice" : "Rechnung"}-${invoice.number ?? (english ? "Draft" : "Entwurf")}`.replace(/[^\w.-]+/g, "_");
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${request.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline"}; filename="${name}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return errorResponse(error, "PDF konnte nicht erstellt werden.");
  }
}
