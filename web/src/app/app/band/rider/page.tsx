import type { Metadata } from "next";
import { RiderEditor } from "@/components/band/rider-editor";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Tech-Rider") };
}

export default function RiderPage() {
  return <RiderEditor />;
}
