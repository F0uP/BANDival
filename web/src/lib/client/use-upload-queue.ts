"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { uploadWithProgress } from "@/lib/client/api";

export type UploadItem = {
  id: string;
  file: File;
  progress: number;
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
  extra?: Record<string, string>;
};

function readAudioDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const audio = new Audio();
      const finish = (value: number | null) => {
        URL.revokeObjectURL(url);
        resolve(value);
      };
      audio.preload = "metadata";
      audio.onloadedmetadata = () => finish(Number.isFinite(audio.duration) ? Math.round(audio.duration) : null);
      audio.onerror = () => finish(null);
      window.setTimeout(() => finish(null), 4000);
      audio.src = url;
    } catch {
      resolve(null);
    }
  });
}

/** Sequential upload queue with progress, cancel and retry. */
export function useUploadQueue({ endpoint, audio = false, onUploaded }: { endpoint: string; audio?: boolean; onUploaded: () => void }) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const cancelRef = useRef<(() => void) | null>(null);
  const busyRef = useRef(false);
  const onUploadedRef = useRef(onUploaded);

  useEffect(() => {
    onUploadedRef.current = onUploaded;
  }, [onUploaded]);

  const update = (id: string, patch: Partial<UploadItem>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  useEffect(() => {
    if (busyRef.current) return;
    const next = items.find((item) => item.status === "queued");
    if (!next) return;
    busyRef.current = true;

    void (async () => {
      update(next.id, { status: "uploading", progress: 0 });
      const formData = new FormData();
      formData.append("file", next.file);
      for (const [key, value] of Object.entries(next.extra ?? {})) {
        formData.append(key, value);
      }
      if (audio) {
        const duration = await readAudioDuration(next.file);
        if (duration) formData.append("durationSeconds", String(duration));
      }
      const request = uploadWithProgress(endpoint, formData, (progress) => update(next.id, { progress }));
      cancelRef.current = request.cancel;
      try {
        await request.promise;
        update(next.id, { status: "done", progress: 100 });
        onUploadedRef.current();
        window.setTimeout(() => setItems((current) => current.filter((item) => item.id !== next.id)), 1500);
      } catch (error) {
        update(next.id, { status: "error", error: error instanceof Error ? error.message : "Upload fehlgeschlagen." });
      } finally {
        cancelRef.current = null;
        busyRef.current = false;
        setItems((current) => [...current]);
      }
    })();
  }, [audio, endpoint, items]);

  const add = useCallback((files: File[] | FileList, extra?: Record<string, string>) => {
    const list = Array.from(files);
    setItems((current) => [
      ...current,
      ...list.map((file) => ({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, file, progress: 0, status: "queued" as const, extra })),
    ]);
  }, []);

  const retry = (id: string) => update(id, { status: "queued", error: undefined, progress: 0 });
  const remove = (id: string) => setItems((current) => current.filter((item) => item.id !== id));
  const cancel = () => cancelRef.current?.();

  return { items, add, retry, remove, cancel };
}
