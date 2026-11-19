"use client";

import { useState } from "react";
import { CheckCircle2, Circle, CircleDot, Plus, Trash2 } from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import { cn } from "@/lib/client/cn";
import { formatRelative } from "@/lib/client/format";
import { useTasks } from "@/lib/client/hooks";
import type { Task, TaskStatus } from "@/lib/client/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/display";
import { Input } from "@/components/ui/form";
import { useToast } from "@/components/ui/feedback";
import { useSession } from "@/components/providers/session";
import { t, translatable } from "@/lib/i18n";

const COLUMNS: Array<{ status: TaskStatus; label: string }> = translatable([
  { status: "open", label: "Offen" },
  { status: "in_progress", label: "In Arbeit" },
  { status: "done", label: "Erledigt" },
]);

const NEXT_STATUS: Record<TaskStatus, TaskStatus> = { open: "in_progress", in_progress: "done", done: "open" };

function StatusIcon({ status }: { status: TaskStatus }) {
  if (status === "done") return <CheckCircle2 className="size-[18px] text-success" />;
  if (status === "in_progress") return <CircleDot className="size-[18px] text-warning" />;
  return <Circle className="size-[18px] text-subtle" />;
}

/** Kanban-style task list for a song or a setlist (columns on desktop, grouped list on phones). */
export function TaskBoard({ songId, setlistId }: { songId?: string; setlistId?: string }) {
  const { bandId } = useSession();
  const tasks = useTasks(bandId, { songId, setlistId });
  const [title, setTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const toast = useToast();

  const list = tasks.data?.tasks ?? [];

  const add = async () => {
    if (!title.trim() || !bandId) return;
    setAdding(true);
    try {
      await api.post("/api/boards/tasks", { bandId, songId, setlistId, title: title.trim() });
      setTitle("");
      await tasks.mutate();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setAdding(false);
    }
  };

  const move = async (task: Task, status: TaskStatus) => {
    await tasks.mutate(
      async (current) => {
        await api.patch("/api/boards/tasks", { taskId: task.id, status });
        return current;
      },
      {
        optimisticData: (current) => ({ tasks: (current?.tasks ?? []).map((entry) => (entry.id === task.id ? { ...entry, status } : entry)) }),
        revalidate: true,
        rollbackOnError: true,
      },
    ).catch((error) => toast.error(errorMessage(error)));
  };

  const remove = async (task: Task) => {
    await tasks.mutate(
      async (current) => {
        await api.delete(`/api/boards/tasks?taskId=${task.id}`);
        return current;
      },
      {
        optimisticData: (current) => ({ tasks: (current?.tasks ?? []).filter((entry) => entry.id !== task.id) }),
        revalidate: true,
        rollbackOnError: true,
      },
    ).catch((error) => toast.error(errorMessage(error)));
  };

  return (
    <div className="space-y-4">
      <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void add(); }}>
        <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t("Neue Aufgabe, z. B. „Bridge-Riff ausarbeiten“")} />
        <Button type="submit" variant="primary" icon={<Plus />} loading={adding} disabled={!title.trim()}>
          <span className="hidden sm:inline">{t("Hinzufügen")}</span>
        </Button>
      </form>

      {tasks.isLoading ? <Skeleton className="h-32" /> : (
        <div className="grid gap-4 md:grid-cols-3">
          {COLUMNS.map((column) => {
            const columnTasks = list.filter((task) => task.status === column.status);
            return (
              <div key={column.status} className="rounded-2xl bg-surface-2/60 p-2">
                <div className="flex items-center justify-between px-2 pb-2 pt-1">
                  <span className="text-[13px] font-semibold">{column.label}</span>
                  <span className="text-xs text-muted">{columnTasks.length}</span>
                </div>
                <ul className="space-y-1.5">
                  {columnTasks.length === 0 ? <li className="px-2 py-3 text-center text-xs text-subtle">–</li> : null}
                  {columnTasks.map((task) => (
                    <li key={task.id} className="group flex items-start gap-2 rounded-xl border border-border bg-surface px-2.5 py-2 shadow-soft">
                      <button
                        type="button"
                        onClick={() => void move(task, NEXT_STATUS[task.status])}
                        className="mt-0.5 shrink-0"
                        aria-label={t(`Status ändern (aktuell: ${column.label})`)}
                        title={t("Klicken zum Weiterschieben")}
                      >
                        <StatusIcon status={task.status} />
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className={cn("text-sm leading-snug", task.status === "done" && "text-muted line-through")}>{task.title}</p>
                        <p className="mt-0.5 text-[11px] text-subtle">{task.updatedBy?.displayName} · {formatRelative(task.updatedAt)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void remove(task)}
                        className="shrink-0 rounded p-0.5 text-subtle opacity-100 hover:text-danger sm:opacity-0 sm:group-hover:opacity-100"
                        aria-label={t("Aufgabe löschen")}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
