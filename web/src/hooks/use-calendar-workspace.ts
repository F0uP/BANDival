import { useMemo } from "react";

type EventLike = {
  id: string;
  title: string;
  startsAt: string;
  venueLabel?: string | null;
};

type NotificationLike = {
  readAt: string | null;
};

export function useCalendarWorkspace(args: {
  events: EventLike[];
  notifications: NotificationLike[];
  nowMs: number;
}) {
  const { events, notifications, nowMs } = args;

  const unreadNotificationCount = useMemo(
    () => notifications.filter((item) => !item.readAt).length,
    [notifications],
  );

  const nextEvent = useMemo(() => {
    return events
      .filter((event) => new Date(event.startsAt).getTime() >= nowMs)
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())[0] ?? null;
  }, [events, nowMs]);

  return {
    unreadNotificationCount,
    nextEvent,
  };
}
