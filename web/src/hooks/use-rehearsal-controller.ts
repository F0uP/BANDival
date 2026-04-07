import { Dispatch, SetStateAction, useCallback } from "react";

type RehearsalItem = {
  songId: string;
  position: number;
  song: {
    title: string;
  };
};

type RehearsalNote = {
  songId: string;
  note: string;
  updatedAt: string;
};

type RehearsalTask = {
  id: string;
  setlistId: string;
  title: string;
  isDone: boolean;
  dueAt: string | null;
  assignee?: {
    displayName?: string | null;
    email: string;
  } | null;
};

export function useRehearsalController(args: {
  apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  selectedSetlistId: string | null;
  newTaskTitle: string;
  newTaskDueAt: string;
  setNewTaskTitle: Dispatch<SetStateAction<string>>;
  setNewTaskDueAt: Dispatch<SetStateAction<string>>;
  setRehearsalItems: Dispatch<SetStateAction<RehearsalItem[]>>;
  setRehearsalNotes: Dispatch<SetStateAction<Record<string, string>>>;
  setRehearsalTasks: Dispatch<SetStateAction<RehearsalTask[]>>;
  setStatusMessage: Dispatch<SetStateAction<string>>;
}) {
  const {
    apiFetch,
    selectedSetlistId,
    newTaskTitle,
    newTaskDueAt,
    setNewTaskTitle,
    setNewTaskDueAt,
    setRehearsalItems,
    setRehearsalNotes,
    setRehearsalTasks,
    setStatusMessage,
  } = args;

  const loadRehearsal = useCallback(async (setlistId: string) => {
    try {
      const res = await apiFetch(`/api/setlists/${setlistId}/rehearsal`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Rehearsal-Daten konnten nicht geladen werden.");
      }

      setRehearsalItems(data.items ?? []);
      const mapped = Object.fromEntries(
        (data.notes as RehearsalNote[]).map((note) => [note.songId, note.note]),
      ) as Record<string, string>;
      setRehearsalNotes(mapped);
      setRehearsalTasks(data.tasks ?? []);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Rehearsal-Daten fehlgeschlagen.");
    }
  }, [apiFetch, setRehearsalItems, setRehearsalNotes, setRehearsalTasks, setStatusMessage]);

  const saveRehearsalNote = useCallback(async (songId: string, note: string) => {
    if (!selectedSetlistId) {
      return;
    }

    try {
      const res = await apiFetch(`/api/setlists/${selectedSetlistId}/rehearsal`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songId, note }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Rehearsal-Notiz konnte nicht gespeichert werden.");
      }

      setRehearsalNotes((prev) => ({ ...prev, [songId]: data.note.note }));
      setStatusMessage("Rehearsal-Notiz gespeichert.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Rehearsal-Notiz fehlgeschlagen.");
    }
  }, [apiFetch, selectedSetlistId, setRehearsalNotes, setStatusMessage]);

  const createRehearsalTask = useCallback(async () => {
    if (!selectedSetlistId || !newTaskTitle.trim()) {
      return;
    }

    try {
      const res = await apiFetch(`/api/setlists/${selectedSetlistId}/rehearsal/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTaskTitle.trim(),
          dueAt: newTaskDueAt ? new Date(newTaskDueAt).toISOString() : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Checklist-Task konnte nicht erstellt werden.");
      }

      setRehearsalTasks((prev) => [data.task, ...prev]);
      setNewTaskTitle("");
      setNewTaskDueAt("");
      setStatusMessage("Checklist-Task erstellt.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Task-Erstellung fehlgeschlagen.");
    }
  }, [apiFetch, newTaskDueAt, newTaskTitle, selectedSetlistId, setNewTaskDueAt, setNewTaskTitle, setRehearsalTasks, setStatusMessage]);

  const toggleRehearsalTask = useCallback(async (task: RehearsalTask) => {
    if (!selectedSetlistId) {
      return;
    }

    try {
      const res = await apiFetch(`/api/setlists/${selectedSetlistId}/rehearsal/tasks`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.id, isDone: !task.isDone }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Task konnte nicht aktualisiert werden.");
      }

      setRehearsalTasks((prev) => prev.map((item) => (item.id === task.id ? data.task : item)));
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Task-Update fehlgeschlagen.");
    }
  }, [apiFetch, selectedSetlistId, setRehearsalTasks, setStatusMessage]);

  const deleteRehearsalTask = useCallback(async (taskId: string) => {
    if (!selectedSetlistId) {
      return;
    }

    try {
      const res = await apiFetch(`/api/setlists/${selectedSetlistId}/rehearsal/tasks?taskId=${taskId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Task konnte nicht geloescht werden.");
      }

      setRehearsalTasks((prev) => prev.filter((item) => item.id !== taskId));
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Task-Loeschen fehlgeschlagen.");
    }
  }, [apiFetch, selectedSetlistId, setRehearsalTasks, setStatusMessage]);

  return {
    loadRehearsal,
    saveRehearsalNote,
    createRehearsalTask,
    toggleRehearsalTask,
    deleteRehearsalTask,
  };
}
