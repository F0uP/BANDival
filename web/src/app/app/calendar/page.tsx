import type { Metadata } from "next";
import { Suspense } from "react";
import { CalendarView } from "@/components/calendar/calendar-view";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Kalender") };
}

export default function CalendarPage() {
  return (
    <Suspense>
      <CalendarView />
    </Suspense>
  );
}
