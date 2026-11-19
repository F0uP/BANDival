"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CalendarDays, CheckCheck, ListMusic, Music2, UserPlus } from "lucide-react";
import { api } from "@/lib/client/api";
import { cn } from "@/lib/client/cn";
import { formatRelative } from "@/lib/client/format";
import { useNotifications } from "@/lib/client/hooks";
import type { AppNotification } from "@/lib/client/types";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";

function iconFor(notification: AppNotification) {
  if (notification.type.startsWith("event")) return <CalendarDays />;
  if (notification.type.startsWith("setlist")) return <ListMusic />;
  if (notification.type.startsWith("invite")) return <UserPlus />;
  return <Music2 />;
}

function targetFor(notification: AppNotification): string | null {
  const payload = notification.payload ?? {};
  if (payload.songId) return `/app/songs/${payload.songId}`;
  if (payload.setlistId) return `/app/setlists/${payload.setlistId}`;
  if (payload.eventId || notification.type.startsWith("event")) return "/app/calendar";
  if (notification.type.startsWith("invite")) return "/app/band";
  return null;
}

export function NotificationsButton() {
  const { data, mutate } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const unread = data?.unreadCount ?? 0;

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const markAll = async () => {
    await api.patch("/api/notifications", { markAllRead: true });
    await mutate();
  };

  const openNotification = async (notification: AppNotification) => {
    setOpen(false);
    if (!notification.readAt) {
      void api.patch("/api/notifications", { notificationId: notification.id }).then(() => mutate());
    }
    const target = targetFor(notification);
    if (target) router.push(target);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="relative inline-flex size-10 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg"
        aria-label={unread > 0 ? `Benachrichtigungen (${unread} neu)` : t("Benachrichtigungen")}
        aria-expanded={open}
      >
        <Bell className="size-[18px]" />
        {unread > 0 ? (
          <span className="absolute right-1.5 top-1.5 flex min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-4 text-accent-fg">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className="fixed inset-x-2 top-[calc(3.75rem+env(safe-area-inset-top))] z-50 flex max-h-[70dvh] flex-col overflow-hidden rounded-[18px] border border-border bg-surface shadow-float sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96"
          style={{ animation: "pop-in 220ms var(--ease-out)", transformOrigin: "top right" }}
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">{t("Benachrichtigungen")}</h2>
            <Button size="sm" variant="ghost" icon={<CheckCheck />} onClick={() => void markAll()} disabled={unread === 0}>
              {t("Alle gelesen")}
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {(data?.notifications ?? []).length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted">{t("Noch keine Benachrichtigungen.")}</p>
            ) : (
              data?.notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => void openNotification(notification)}
                  className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-surface-2"
                >
                  <span className={cn(
                    "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4",
                    notification.readAt ? "bg-surface-2 text-muted" : "bg-accent-soft text-accent-text",
                  )}>
                    {iconFor(notification)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-sm", !notification.readAt && "font-semibold")}>{t(notification.title)}</span>
                    <span className="mt-0.5 line-clamp-2 block text-[13px] text-muted">{t(notification.body)}</span>
                    <span className="mt-1 block text-xs text-subtle">{formatRelative(notification.createdAt)}</span>
                  </span>
                  {!notification.readAt ? <span className="mt-2 size-2 shrink-0 rounded-full bg-accent" /> : null}
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
