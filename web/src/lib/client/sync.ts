"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { mutate as revalidateAll } from "swr";
import { api, ApiError, errorMessage } from "@/lib/client/api";
import { useToast } from "@/components/ui/feedback";
import { t } from "@/lib/i18n";

/*
 * Saving collaboratively edited documents (songs, lead sheets, parts, scores, setlists):
 * - every save carries the revision it is based on, the server merges like git
 * - without connection, changes go to an outbox (localStorage) and are sent – and merged – later
 * - unresolvable overlaps come back as merge conflicts (and as push notification)
 */

export type SaveStatus = "saved" | "merged" | "queued" | "conflict";
export type ConflictInfo = { id: string; labels: string[] };
export type DocSaveResult<T> = { status: SaveStatus; data?: T; conflict?: ConflictInfo };

type OutboxEntry = {
  id: string;
  method: "PATCH" | "PUT";
  url: string;
  body: Record<string, unknown>;
  /** Document key, e.g. "song:<id>" – changes to the same document are coalesced. */
  key: string;
  title: string;
  queuedAt: string;
};

const STORAGE_KEY = "bandival.outbox.v1";
const CHANGE_EVENT = "bandival:outbox";
export const CONFLICT_EVENT = "bandival:conflict";
export const DROPPED_EVENT = "bandival:outbox-dropped";

function readOutbox(): OutboxEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as OutboxEntry[]) : [];
  } catch {
    return [];
  }
}

function writeOutbox(entries: OutboxEntry[]) {
  try {
    if (entries.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable – nothing we can do */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function removeEntry(id: string) {
  writeOutbox(readOutbox().filter((entry) => entry.id !== id));
}

/** Several offline edits of the same document become one change; the oldest base revision is kept so the server merges correctly. */
function enqueue(entry: Omit<OutboxEntry, "id" | "queuedAt">) {
  const entries = readOutbox();
  const existing = entries.find((candidate) => candidate.key === entry.key && candidate.url === entry.url && candidate.method === entry.method);
  if (existing) {
    existing.body = { ...existing.body, ...entry.body, baseRevision: existing.body.baseRevision ?? entry.body.baseRevision };
    existing.title = entry.title;
  } else {
    entries.push({ ...entry, id: crypto.randomUUID(), queuedAt: new Date().toISOString() });
  }
  writeOutbox(entries);
}

function send<T>(method: OutboxEntry["method"], url: string, body: unknown): Promise<T> {
  return method === "PUT" ? api.put<T>(url, body) : api.patch<T>(url, body);
}

function mergeStatus(data: unknown): "saved" | "merged" {
  return (data as { merge?: { status?: string } } | null)?.merge?.status === "merged" ? "merged" : "saved";
}

function conflictOf(error: unknown): ConflictInfo | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  const conflict = (error.data as { conflict?: ConflictInfo } | null)?.conflict;
  return conflict?.id ? conflict : null;
}

function announceConflict(conflict: ConflictInfo, title: string) {
  window.dispatchEvent(new CustomEvent(CONFLICT_EVENT, { detail: { ...conflict, title } }));
}

let flushing: Promise<Map<string, DocSaveResult<unknown>>> | null = null;

/** Sends queued offline changes in order. Stops at the first network error and tries again later. */
export function flushOutbox(): Promise<Map<string, DocSaveResult<unknown>>> {
  if (flushing) return flushing;
  flushing = (async () => {
    const results = new Map<string, DocSaveResult<unknown>>();
    for (const entry of readOutbox()) {
      try {
        const data = await send(entry.method, entry.url, entry.body);
        results.set(entry.key, { status: mergeStatus(data), data });
        removeEntry(entry.id);
      } catch (error) {
        const conflict = conflictOf(error);
        if (conflict) {
          results.set(entry.key, { status: "conflict", conflict });
          removeEntry(entry.id);
          announceConflict(conflict, entry.title);
          continue;
        }
        if (error instanceof ApiError && (error.status === 0 || error.status === 401 || error.status === 429 || error.status >= 500)) break;
        // The change can no longer be applied (document deleted, no access …) – drop it so it does not block the queue.
        removeEntry(entry.id);
        window.dispatchEvent(new CustomEvent(DROPPED_EVENT, { detail: { title: entry.title, message: errorMessage(error) } }));
      }
    }
    if (results.size) void revalidateAll(() => true);
    return results;
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

/**
 * Saves a document change with its base revision. Offline → queued; overlapping edits → merged by the server;
 * irreconcilable → conflict (to be resolved under /app/conflicts).
 */
export async function saveDoc<T>(input: { method?: OutboxEntry["method"]; url: string; body: Record<string, unknown>; key: string; title: string }): Promise<DocSaveResult<T>> {
  const method = input.method ?? "PATCH";
  // Older offline changes of the same document go first – otherwise they would be merged against the newer state.
  if (readOutbox().some((entry) => entry.key === input.key)) {
    enqueue({ method, url: input.url, body: input.body, key: input.key, title: input.title });
    const results = await flushOutbox();
    return (results.get(input.key) as DocSaveResult<T> | undefined) ?? { status: "queued" };
  }
  try {
    const data = await send<T>(method, input.url, input.body);
    return { status: mergeStatus(data), data };
  } catch (error) {
    const conflict = conflictOf(error);
    if (conflict) {
      announceConflict(conflict, input.title);
      return { status: "conflict", conflict };
    }
    if (error instanceof ApiError && error.status === 0) {
      enqueue({ method, url: input.url, body: input.body, key: input.key, title: input.title });
      return { status: "queued" };
    }
    throw error;
  }
}

function subscribe(callback: () => void) {
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

/** Number of changes waiting for a connection. */
export function useOutboxCount(): number {
  return useSyncExternalStore(subscribe, () => readOutbox().length, () => 0);
}

/** Keeps the outbox flowing: on start, when the connection returns, when the tab becomes visible and every 20 s. */
export function useOutboxSync() {
  const toast = useToast();
  useEffect(() => {
    const run = () => {
      if (readOutbox().length && navigator.onLine !== false) void flushOutbox();
    };
    const onDropped = (event: Event) => {
      const detail = (event as CustomEvent<{ title: string; message: string }>).detail;
      toast.error(t(`Offline-Änderung an „${detail.title}“ konnte nicht übernommen werden: ${detail.message}`));
    };
    run();
    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", run);
    window.addEventListener(DROPPED_EVENT, onDropped);
    const timer = window.setInterval(run, 20_000);
    return () => {
      window.removeEventListener("online", run);
      document.removeEventListener("visibilitychange", run);
      window.removeEventListener(DROPPED_EVENT, onDropped);
      window.clearInterval(timer);
    };
  }, [toast]);
}

/** Toasts for the non-trivial outcomes of a save; returns true when the change is on the server (saved or merged). */
export function useSaveFeedback() {
  const toast = useToast();
  return useCallback((result: DocSaveResult<unknown>, successMessage?: string): boolean => {
    switch (result.status) {
      case "saved":
        if (successMessage) toast.success(successMessage);
        return true;
      case "merged":
        toast.success(t("Gespeichert – mit gleichzeitigen Änderungen anderer zusammengeführt."));
        return true;
      case "queued":
        toast.info(t("Offline gespeichert – wird automatisch synchronisiert und zusammengeführt."));
        return false;
      case "conflict":
        toast.error(t(`Merge-Konflikt bei ${result.conflict?.labels.slice(0, 2).join(", ") || t("deiner Änderung")} – entscheide unter „Konflikte“, wie zusammengeführt wird.`));
        return false;
    }
  }, [toast]);
}
