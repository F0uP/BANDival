import type { Metadata } from "next";
import { BandView } from "@/components/band/band-view";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Band") };
}

export default function BandPage() {
  return <BandView />;
}
