"use client";

import { useRef, useState, type ReactNode } from "react";
import { RotateCcw, Upload, X } from "lucide-react";
import { cn } from "@/lib/client/cn";
import { formatBytes } from "@/lib/client/format";
import type { UploadItem } from "@/lib/client/use-upload-queue";

export function UploadZone({
  onFiles,
  accept,
  label,
  hint,
  disabled,
}: {
  onFiles: (files: FileList) => void;
  accept?: string;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (!disabled && event.dataTransfer.files.length > 0) onFiles(event.dataTransfer.files);
      }}
      className={cn(
        "flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed px-4 py-5 text-center transition-colors",
        dragging ? "border-accent bg-accent-soft" : "border-border hover:border-border-strong",
        disabled && "opacity-50",
      )}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className="inline-flex items-center gap-2 text-sm font-medium text-accent-text hover:underline"
      >
        <Upload className="size-4" />
        {label}
      </button>
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept}
        className="hidden"
        onChange={(event) => {
          if (event.target.files && event.target.files.length > 0) onFiles(event.target.files);
          event.target.value = "";
        }}
      />
    </div>
  );
}

export function UploadList({
  items,
  onRetry,
  onRemove,
  onCancel,
}: {
  items: UploadItem[];
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  onCancel: () => void;
}) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-3 space-y-2">
      {items.map((item) => (
        <li key={item.id} className="rounded-xl border border-border bg-surface-2/50 px-3 py-2.5">
          <div className="flex items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{item.file.name}</span>
            <span className="shrink-0 text-xs text-muted">
              {item.status === "error" ? <span className="text-danger">{item.error}</span>
                : item.status === "done" ? "Fertig"
                  : item.status === "queued" ? "Wartet …"
                    : `${item.progress}% · ${formatBytes(item.file.size)}`}
            </span>
            {item.status === "uploading" ? (
              <button type="button" onClick={onCancel} className="text-muted hover:text-fg" aria-label="Upload abbrechen"><X className="size-4" /></button>
            ) : item.status === "error" ? (
              <>
                <button type="button" onClick={() => onRetry(item.id)} className="text-muted hover:text-fg" aria-label="Erneut versuchen"><RotateCcw className="size-4" /></button>
                <button type="button" onClick={() => onRemove(item.id)} className="text-muted hover:text-fg" aria-label="Entfernen"><X className="size-4" /></button>
              </>
            ) : null}
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3">
            <div
              className={cn("h-full rounded-full transition-[width] duration-200", item.status === "error" ? "bg-danger" : item.status === "done" ? "bg-success" : "bg-accent")}
              style={{ width: `${item.status === "error" ? 100 : item.progress}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
