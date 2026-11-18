import type { Metadata } from "next";
import { RiderEditor } from "@/components/band/rider-editor";

export const metadata: Metadata = { title: "Tech-Rider" };

export default function RiderPage() {
  return <RiderEditor />;
}
