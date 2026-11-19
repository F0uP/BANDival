import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Datenschutzerklärung") };
}

export default function Page() {
  return <LegalPage slug="datenschutz" />;
}
