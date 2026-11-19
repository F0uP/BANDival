import type { Metadata } from "next";
import { EventDetailView } from "@/components/events/event-detail";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Termin") };
}

export default async function EventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <EventDetailView key={eventId} eventId={eventId} />;
}
