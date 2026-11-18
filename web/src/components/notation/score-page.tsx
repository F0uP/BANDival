"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileMusic } from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import { saveDoc } from "@/lib/client/sync";
import { mergePreferOurs, type DocSpec, type FieldSpec } from "@/lib/merge/document";
import { DOC_SPECS } from "@/lib/merge/specs";
import type { SongScoreRecord } from "@/lib/client/types";
import { useSongScore } from "@/lib/client/hooks";
import { useRevalidate } from "@/lib/client/mutations";
import { sanitizeScore, type ScoreDoc } from "@/lib/notation/model";
import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/display";
import { useConfirm, useToast } from "@/components/ui/feedback";
import { useSession } from "@/components/providers/session";
import { ScoreEditor } from "@/components/notation/score-editor";

type SaveState = "saved" | "saving" | "dirty" | "error" | "offline" | "conflict";

/** Field spec of the notation document itself (events merged per note id). */
const SCORE_DATA_SPEC = (DOC_SPECS.score.data as Extract<FieldSpec, { kind: "object" }>).fields as DocSpec;

/** Full-page notation editor with debounced autosave and conflict detection. */
export function ScorePageView({ songId, scoreId }: { songId: string; scoreId: string }) {
  const router = useRouter();
  const { band } = useSession();
  const { data, error, isLoading } = useSongScore(songId, scoreId);
  const [title, setTitle] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const pending = useRef<{ doc?: ScoreDoc; title?: string } | null>(null);
  /** Revision the editor content is based on – the server merges others' edits per note (git-like). */
  const baseRevision = useRef<number | null>(null);
  /** Latest document of the editor (also while a save is running). */
  const latestDoc = useRef<ScoreDoc | null>(null);
  const [rebased, setRebased] = useState<{ key: number; doc: ScoreDoc } | null>(null);
  const timer = useRef<number>(0);
  const toast = useToast();
  const confirm = useConfirm();
  const revalidate = useRevalidate();
  const readOnly = band?.role === "guest";

  const score = data?.score;
  const initial = useMemo(() => (score ? sanitizeScore(score.data) : null), [score]);

  useEffect(() => {
    if (score && baseRevision.current === null) baseRevision.current = score.revision ?? null;
  }, [score]);

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    const changes = pending.current;
    if (!changes) return;
    pending.current = null;
    setSaveState("saving");
    try {
      const result = await saveDoc<{ score: SongScoreRecord }>({
        url: `/api/songs/${songId}/scores/${scoreId}`,
        body: {
          ...(changes.doc ? { data: changes.doc } : {}),
          ...(changes.title !== undefined ? { title: changes.title.trim() || "Noten" } : {}),
          baseRevision: baseRevision.current,
        },
        key: `score:${scoreId}`,
        title: changes.title ?? "Noten",
      });
      if (result.status === "queued") {
        setSaveState("offline");
        return;
      }
      if (result.status === "conflict") {
        setSaveState("conflict");
        toast.error("Merge-Konflikt in den Noten – entscheide unter „Konflikte“, wie zusammengeführt wird.");
        return;
      }
      const server = result.data?.score;
      if (server?.revision) baseRevision.current = server.revision;
      if (result.status === "merged" && server && changes.doc) {
        // Others edited meanwhile: take over their notes and replay what was typed during the save on top.
        const serverDoc = sanitizeScore(server.data);
        // (re-read: the ref may have been filled while the request was running)
        const meanwhile = pending.current as { doc?: ScoreDoc; title?: string } | null;
        const typedMeanwhile = meanwhile?.doc;
        const next = typedMeanwhile
          ? sanitizeScore(mergePreferOurs(SCORE_DATA_SPEC, changes.doc as unknown as Record<string, unknown>, typedMeanwhile as unknown as Record<string, unknown>, serverDoc as unknown as Record<string, unknown>, { theirsName: "andere" }))
          : serverDoc;
        latestDoc.current = next;
        if (typedMeanwhile && meanwhile) pending.current = { ...meanwhile, doc: next };
        setRebased((current) => ({ key: (current?.key ?? 0) + 1, doc: next }));
        toast.success("Änderungen von anderen wurden in deine Noten eingearbeitet.");
      }
      setSaveState(pending.current ? "dirty" : "saved");
    } catch (err) {
      setSaveState("error");
      pending.current = { ...changes, ...(pending.current ?? {}) };
      toast.error(`Speichern fehlgeschlagen: ${errorMessage(err)}`);
    }
  }, [scoreId, songId, toast]);

  const schedule = useCallback((changes: { doc?: ScoreDoc; title?: string }) => {
    if (changes.doc) latestDoc.current = changes.doc;
    pending.current = { ...pending.current, ...changes };
    setSaveState("dirty");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), 1200);
  }, [flush]);

  // Save on tab close / navigation.
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (pending.current) {
        void flush();
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      if (pending.current) void flush();
    };
  }, [flush]);

  const back = async () => {
    await flush();
    void revalidate(`/api/songs/${songId}/scores`);
    router.push(`/app/songs/${songId}?tab=scores`);
  };

  const remove = async () => {
    const ok = await confirm({ title: "Noten löschen?", description: "Diese Noten werden endgültig gelöscht.", confirmLabel: "Löschen", tone: "danger" });
    if (!ok) return;
    try {
      pending.current = null;
      await api.delete(`/api/songs/${songId}/scores/${scoreId}`);
      await revalidate(`/api/songs/${songId}/scores`);
      router.push(`/app/songs/${songId}?tab=scores`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  if (error) {
    return <EmptyState icon={<FileMusic />} title="Noten nicht gefunden" description={errorMessage(error)} action={<Button onClick={() => router.push(`/app/songs/${songId}`)}>Zum Song</Button>} />;
  }
  if (isLoading || !score || !initial) {
    return <div className="space-y-3"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-80" /></div>;
  }

  return (
    <ScoreEditor
      key={rebased?.key ?? 0}
      title={title ?? score.title}
      initial={rebased?.doc ?? initial}
      saveState={saveState}
      readOnly={readOnly}
      onChange={(doc) => schedule({ doc })}
      onTitleChange={(value) => {
        setTitle(value);
        schedule({ title: value });
      }}
      onBack={() => void back()}
      onDelete={() => void remove()}
    />
  );
}
