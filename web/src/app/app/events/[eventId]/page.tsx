import type { Metadata } from "next";
import { EventDetailView } from "@/components/events/event-detail";

export const metadata: Metadata = { title: "Termin" };

export default async function EventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <EventDetailView key={eventId} eventId={eventId} />;
}
