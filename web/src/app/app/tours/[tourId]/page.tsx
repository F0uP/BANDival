import type { Metadata } from "next";
import { TourDetail } from "@/components/tours/tour-detail";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Tour") };
}

export default async function TourPage({ params }: { params: Promise<{ tourId: string }> }) {
  const { tourId } = await params;
  return <TourDetail tourId={tourId} />;
}
