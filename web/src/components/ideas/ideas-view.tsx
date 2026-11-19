"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { FileAudio, Lightbulb, Loader2, Mic, MoreHorizontal, Music2, Pause, Pencil, Play, Sparkles, Square, Trash2, Upload } from "lucide-react";
import { api, errorMessage, uploadWithProgress } from "@/lib/client/api";
import { cn } from "@/lib/client/cn";
import { formatDuration, formatRelative } from "@/lib/client/format";
import { useAiStatus } from "@/lib/client/hooks";
import { useRevalidate } from "@/lib/client/mutations";
import { Button } from "@/components/ui/button";
import { Avatar, Badge, Card, EmptyState, PageHeader, SkeletonList } from "@/components/ui/display";
import { Input, Textarea } from "@/components/ui/form";
import { Menu } from "@/components/ui/navigation";
import { useConfirm, useToast } from "@/components/ui/feedback";
import { usePlayer } from "@/components/providers/player";
import { useSession } from "@/components/providers/session";
import { t } from "@/lib/i18n";
import { AUDIO_ACCEPT } from "@/lib/audio-formats";
import { useRefreshWhilePending } from "@/lib/client/audio-status";

export type Idea = {
  id: string;
  title: string;
  notes: string | null;
  fileUrl: string | null;
  fileName: string | null;
  mimeType: string | null;
  durationSeconds: number | null;
  /** "pending" while the recording is converted to MP3 on the server */
  transcodeStatus?: "pending" | "done" | "failed" | null;
  songId: string | null;
  createdAt: string;
  createdBy: { id: string; displayName: string; avatarUrl: string | null } | null;
  song: { id: string; title: string } | null;
};

function pickMimeType(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"];
  return candidates.find((type) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) ?? "";
}

/** Voice memo recorder with level meter (MediaRecorder). */
function Recorder({ onRecorded }: { onRecorded: (blob: Blob, seconds: number) => void }) {
  const [state, setState] = useState<"idle" | "recording">("idle");
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const cleanupRef = useRef<() => void>(() => undefined);
  const toast = useToast();

  useEffect(() => () => cleanupRef.current(), []);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true } });
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 128_000 } : undefined);
      const chunks: Blob[] = [];
      const startedAt = Date.now();
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buffer = new Uint8Array(analyser.fftSize);
      let frame = 0;
      const meter = () => {
        analyser.getByteTimeDomainData(buffer);
        let peak = 0;
        for (const value of buffer) peak = Math.max(peak, Math.abs(value - 128));
        setLevel(peak / 128);
        setSeconds(Math.floor((Date.now() - startedAt) / 1000));
        frame = requestAnimationFrame(meter);
      };
      frame = requestAnimationFrame(meter);
      cleanupRef.current = () => {
        cancelAnimationFrame(frame);
        stream.getTracks().forEach((track) => track.stop());
        void ctx.close();
      };
      recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
      recorder.onstop = () => {
        cleanupRef.current();
        setState("idle");
        setLevel(0);
        onRecorded(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }), Math.round((Date.now() - startedAt) / 1000));
      };
      recorder.start(1000);
      recorderRef.current = recorder;
      setSeconds(0);
      setState("recording");
    } catch (error) {
      toast.error((error as Error).name === "NotAllowedError" ? t("Mikrofon-Zugriff wurde verweigert.") : t("Aufnahme nicht möglich: ") + (error as Error).message);
    }
  };

  const stop = () => recorderRef.current?.state === "recording" && recorderRef.current.stop();

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={state === "recording" ? stop : () => void start()}
        className={cn(
          "relative flex size-16 shrink-0 items-center justify-center rounded-full text-white shadow-lg transition-transform active:scale-95",
          state === "recording" ? "bg-danger" : "bg-accent",
        )}
        aria-label={state === "recording" ? t("Aufnahme stoppen") : t("Aufnahme starten")}
      >
        {state === "recording" ? (
          <>
            <span className="absolute inset-0 rounded-full bg-danger opacity-40" style={{ transform: `scale(${1 + level * 0.6})` }} />
            <Square className="relative size-6 fill-current" />
          </>
        ) : <Mic className="size-7" />}
      </button>
      <div>
        <p className="font-medium">{state === "recording" ? t(`Aufnahme läuft · ${formatDuration(seconds)}`) : t("Idee aufnehmen")}</p>
        <p className="text-sm text-muted">{state === "recording" ? t("Tippen zum Stoppen") : t("Riff, Melodie, Textzeile – einfach drauflos.")}</p>
      </div>
    </div>
  );
}

function IdeaCard({ idea, aiTranscribe, onChanged }: { idea: Idea; aiTranscribe: boolean; onChanged: () => void }) {
  const player = usePlayer();
  const router = useRouter();
  const { me, band, can } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const revalidate = useRevalidate();
  const [busy, setBusy] = useState(false);
  const active = Boolean(idea.fileUrl && player.track?.url === idea.fileUrl);

  const rename = async () => {
    const title = await confirm({ title: t("Umbenennen"), confirmLabel: t("Speichern"), input: { defaultValue: idea.title } });
    if (typeof title !== "string" || !title.trim()) return;
    await api.patch(`/api/ideas/${idea.id}`, { title: title.trim() }).catch((error) => toast.error(errorMessage(error)));
    onChanged();
  };

  const editNotes = async () => {
    const notes = await confirm({ title: t("Notizen"), confirmLabel: t("Speichern"), input: { defaultValue: idea.notes ?? "", multiline: true, allowEmpty: true } });
    if (typeof notes !== "string") return;
    await api.patch(`/api/ideas/${idea.id}`, { notes }).catch((error) => toast.error(errorMessage(error)));
    onChanged();
  };

  const convert = async () => {
    setBusy(true);
    try {
      const result = await api.post<{ songId: string }>(`/api/ideas/${idea.id}/convert`);
      await revalidate("/api/songs");
      router.push(`/app/songs/${result.songId}`);
    } catch (error) {
      toast.error(errorMessage(error));
      setBusy(false);
    }
  };

  const transcribe = async () => {
    setBusy(true);
    try {
      await api.post(`/api/ideas/${idea.id}/transcribe`);
      onChanged();
      toast.success(t("Transkript hinzugefügt."));
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = await confirm({ title: t(`„${idea.title}“ löschen?`), confirmLabel: t("Löschen"), tone: "danger" });
    if (!ok) return;
    await api.delete(`/api/ideas/${idea.id}`).catch((error) => toast.error(errorMessage(error)));
    onChanged();
  };

  const canDelete = idea.createdBy?.id === me?.userId || band?.role === "owner" || band?.role === "admin";

  return (
    <Card className="flex gap-3">
      {idea.fileUrl ? (
        <button
          type="button"
          onClick={() => (active ? player.toggle() : player.play({ url: idea.fileUrl!, title: idea.title, subtitle: t("Idee") }))}
          disabled={idea.transcodeStatus === "pending"}
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-text hover:bg-accent hover:text-accent-fg disabled:pointer-events-none disabled:opacity-60"
          aria-label={idea.transcodeStatus === "pending" ? t("Wird in MP3 umgewandelt …") : active && player.playing ? t("Pause") : t("Abspielen")}
        >
          {idea.transcodeStatus === "pending" ? <Loader2 className="size-4 animate-spin" /> : active && player.playing ? <Pause className="size-4 fill-current" /> : <Play className="ml-0.5 size-4 fill-current" />}
        </button>
      ) : (
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted"><Lightbulb className="size-5" /></span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-medium">{idea.title}</p>
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <Avatar name={idea.createdBy?.displayName} src={idea.createdBy?.avatarUrl} size="xs" />
              {idea.createdBy?.displayName ?? "?"} · {formatRelative(idea.createdAt)}{idea.durationSeconds ? ` · ${formatDuration(idea.durationSeconds)}` : ""}
            </p>
          </div>
          <Menu
            trigger={({ toggle }) => <Button size="icon-sm" variant="ghost" onClick={toggle} aria-label={t("Aktionen")}><MoreHorizontal /></Button>}
            items={[
              { label: t("Umbenennen"), icon: <Pencil />, onSelect: () => void rename() },
              { label: t("Notizen bearbeiten"), icon: <Pencil />, onSelect: () => void editNotes() },
              ...(aiTranscribe && idea.fileUrl ? [{ label: t("Transkribieren (KI)"), icon: <Sparkles />, onSelect: () => void transcribe() }] : []),
              ...(idea.fileUrl ? [{ label: t("Herunterladen"), icon: <FileAudio />, onSelect: () => window.open(`${idea.fileUrl}?download=1`, "_blank") }] : []),
              ...(canDelete ? [{ type: "separator" as const }, { label: t("Löschen"), icon: <Trash2 />, danger: true, onSelect: () => void remove() }] : []),
            ]}
          />
        </div>
        {idea.notes ? <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm text-muted">{idea.notes}</p> : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {idea.song ? (
            <Link href={`/app/songs/${idea.song.id}`}><Badge tone="success"><Music2 className="size-3" /> {idea.song.title}</Badge></Link>
          ) : can("songs.create") ? (
            <Button size="sm" icon={<Music2 />} loading={busy} onClick={() => void convert()}>{t("Zum Song machen")}</Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

export function IdeasView() {
  const { bandId, can } = useSession();
  const params = useSearchParams();
  const { data, isLoading, mutate } = useSWR<{ ideas: Idea[] }>(bandId ? `/api/ideas?bandId=${bandId}` : null);
  useRefreshWhilePending(Boolean(data?.ideas.some((idea) => idea.transcodeStatus === "pending")), () => void mutate());
  const ai = useAiStatus();
  const [draft, setDraft] = useState<{ blob: Blob; seconds: number; url: string } | null>(null);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const autoRecord = params.get("record") === "1";

  useEffect(() => () => {
    if (draft) URL.revokeObjectURL(draft.url);
  }, [draft]);

  const save = async (blob: Blob | null, seconds: number | null, fileName?: string) => {
    if (!bandId) return;
    setSaving(true);
    setProgress(0);
    const form = new FormData();
    form.append("bandId", bandId);
    form.append("title", title.trim());
    form.append("notes", notes.trim());
    if (blob) form.append("file", blob, fileName ?? `idee-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.${blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm"}`);
    if (seconds) form.append("durationSeconds", String(seconds));
    try {
      await uploadWithProgress("/api/ideas", form, (percent) => setProgress(percent)).promise;
      setDraft(null);
      setTitle("");
      setNotes("");
      await mutate();
      toast.success(t("Idee gespeichert."));
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const ideas = data?.ideas ?? [];

  return (
    <>
      <PageHeader title={t("Ideen")} description={t("Die Inbox für Riffs, Melodien und Textzeilen – bevor sie zu Songs werden.")} />
      {can("ideas.create") ? (
        <Card className="mb-6 space-y-4">
          {draft ? (
            <div className="space-y-3">
              <audio src={draft.url} controls className="w-full" />
              <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t("Titel (optional)")} aria-label={t("Titel")} autoFocus />
              <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} placeholder={t("Notizen: Tonart, Tempo, Textidee …")} aria-label={t("Notizen")} />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setDraft(null)}>{t("Verwerfen")}</Button>
                <Button variant="primary" loading={saving} onClick={() => void save(draft.blob, draft.seconds)}>
                  {saving && progress > 0 ? `${Math.round(progress)} %` : t("Speichern")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <Recorder key={autoRecord ? "auto" : "manual"} onRecorded={(blob, seconds) => setDraft({ blob, seconds, url: URL.createObjectURL(blob) })} />
              <div className="flex gap-2">
                <Button icon={<Upload />} onClick={() => fileRef.current?.click()}>{t("Datei")}</Button>
                <Button variant="ghost" icon={<Pencil />} onClick={() => {
                  const text = window.prompt(t("Textidee / Notiz"));
                  if (text?.trim()) {
                    setNotes(text.trim());
                    setTitle(text.trim().split("\n")[0].slice(0, 60));
                    void save(null, null);
                  }
                }}>{t("Notiz")}</Button>
              </div>
              <input ref={fileRef} type="file" accept={AUDIO_ACCEPT} className="hidden" onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) setDraft({ blob: file, seconds: 0, url: URL.createObjectURL(file) });
                event.target.value = "";
              }} />
            </div>
          )}
        </Card>
      ) : null}

      {isLoading ? <SkeletonList rows={4} /> : ideas.length === 0 ? (
        <EmptyState icon={<Lightbulb />} title={t("Noch keine Ideen")} description={t("Nimm ein Riff auf oder lade ein Sprachmemo hoch – die ganze Band kann reinhören und daraus einen Song machen.")} />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {ideas.map((idea) => <IdeaCard key={idea.id} idea={idea} aiTranscribe={Boolean(ai.data?.transcription)} onChanged={() => void mutate()} />)}
        </div>
      )}
    </>
  );
}
