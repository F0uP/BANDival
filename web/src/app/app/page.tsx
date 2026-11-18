import type { Metadata } from "next";
import { Dashboard } from "@/components/dashboard/dashboard";

export const metadata: Metadata = { title: "Übersicht" };

export default function AppHomePage() {
  return <Dashboard />;
}
