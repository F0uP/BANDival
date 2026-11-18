import type { Metadata } from "next";
import { SettingsView } from "@/components/settings/settings-view";

export const metadata: Metadata = { title: "Einstellungen" };

export default function SettingsPage() {
  return <SettingsView />;
}
