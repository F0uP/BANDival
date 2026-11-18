import type { Metadata } from "next";
import { BandView } from "@/components/band/band-view";

export const metadata: Metadata = { title: "Band" };

export default function BandPage() {
  return <BandView />;
}
