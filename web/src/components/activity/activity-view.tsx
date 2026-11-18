"use client";

import Link from "next/link";
import { useState } from "react";
import { Activity } from "lucide-react";
import { ACTIVITY_FILTERS, describeActivity } from "@/lib/client/activity";
import { cn } from "@/lib/client/cn";
import { formatDateLong, formatTime, toDateKey } from "@/lib/client/format";
import { useAuditLog } from "@/lib/client/hooks";
import type { AuditEntry } from "@/lib/client/types";
import { Button } from "@/components/ui/button";
import { Avatar, EmptyState, PageHeader, SkeletonList } from "@/components/ui/display";
import { useSession } from "@/components/providers/session";

export function ActivityView() {
  const { bandId } = useSession();
  const [filter, setFilter] = useState("all");
  const { data, size, setSize, isLoading, isValidating } = useAuditLog(bandId, filter === "all" ? null : filter);
  const entries: AuditEntry[] = (data ?? []).flatMap((page) => page.logs);
  const hasMore = data?.at(-1)?.hasMore ?? false;

  const groups = new Map<string, AuditEntry[]>();
  for (const entry of entries) {
    const key = toDateKey(new Date(entry.createdAt));
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }

  return (
    <>
      <PageHeader title="Aktivität" description="Was in der Band passiert ist." />
      <div className="scrollbar-none -mx-4 mb-5 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {ACTIVITY_FILTERS.map((entry) => (
          <button
            key={entry.value}
            type="button"
            onClick={() => setFilter(entry.value)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-[13px] font-medium",
              filter === entry.value ? "border-fg bg-fg text-bg" : "border-border text-muted hover:text-fg",
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {isLoading ? <SkeletonList /> : entries.length === 0 ? (
        <EmptyState icon={<Activity />} title="Noch keine Aktivität" />
      ) : (
        <div className="space-y-8">
          {Array.from(groups.entries()).map(([day, list]) => (
            <section key={day}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">{formatDateLong(new Date(`${day}T12:00:00`))}</h2>
              <ol className="relative space-y-4 border-l border-border pl-5">
                {list.map((entry) => {
                  const described = describeActivity(entry);
                  const body = (
                    <span className="text-sm">
                      <span className="font-medium">{entry.actor?.displayName ?? "System"}</span>{" "}
                      <span className="text-muted">{described.text}</span>
                    </span>
                  );
                  return (
                    <li key={entry.id} className="relative">
                      <span className="absolute -left-[33px] top-0">
                        <Avatar name={entry.actor?.displayName ?? "System"} src={entry.actor?.avatarUrl} size="xs" ring="ring-4 ring-bg" />
                      </span>
                      <div className="flex items-start justify-between gap-3">
                        {described.href ? <Link href={described.href} className="hover:underline">{body}</Link> : body}
                        <span className="shrink-0 text-xs tabular-nums text-subtle">{formatTime(entry.createdAt)}</span>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
          {hasMore ? (
            <div className="flex justify-center">
              <Button loading={isValidating} onClick={() => void setSize(size + 1)}>Ältere laden</Button>
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}
