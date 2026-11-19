"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { Check, Download, Headphones, Loader2, MessageSquarePlus, Pause, Play, Plus, Repeat, Trash2, Volume2, VolumeX } from "lucide-react";
import { api, errorMessage, uploadWithProgress } from "@/lib/client/api";
import { cn } from "@/lib/client/cn";
import { formatDuration } from "@/lib/client/format";
import { useAudioComments, useSongStems } from "@/lib/client/hooks";
import type { AudioVersion } from "@/lib/client/types";
import { Button } from "@/components/ui/button";
import { Avatar, Card, CardHeader } from "@/components/ui/display";
import { Input } from "@/components/ui/form";
import { useConfirm, useToast } from "@/components/ui/feedback";
import { usePlayer } from "@/components/providers/player";
import { useSession } from "@/components/providers/session";
import { t } from "@/lib/i18n";
import { AUDIO_ACCEPT } from "@/lib/audio-formats";
import { originalLabel, useRefreshWhilePending } from "@/lib/client/audio-status";

function clock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

/* ---------------- Multitrack (stems) ---------------- */

type TrackState = { volume: number; muted: boolean; solo: boolean };

/** Plays stems in sync (one media element per track, drift-corrected) with mute/solo/volume and an A/B loop. */

/** Moves the playhead of the shared audio element (kept outside components: the element is not React state). */
function seekElement(element: HTMLAudioElement | null, seconds: number) {
  if (element) element.currentTime = seconds;
}

export function StemMixer({ songId, readOnly }: { songId: string; readOnly: boolean }) {
  const { data, mutate } = useSongStems(songId);
  const stems = useMemo(() => data?.stems ?? [], [data]);
  useRefreshWhilePending(stems.some((stem) => stem.transcodeStatus === "pending"), () => void mutate());
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const [state, setState] = useState<Record<string, TrackState>>({});
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loop, setLoop] = useState<{ a: number | null; b: number | null }>({ a: null, b: null });
  const [uploading, setUploading] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const confirm = useConfirm();

  const anySolo = Object.values(state).some((track) => track.solo);
  const trackState = (id: string): TrackState => state[id] ?? { volume: 0.9, muted: false, solo: false };

  useEffect(() => {
    for (const stem of stems) {
      const audio = audioRefs.current.get(stem.id);
      if (!audio) continue;
      const track = state[stem.id] ?? { volume: 0.9, muted: false, solo: false };
      const audible = anySolo ? track.solo : !track.muted;
      audio.volume = audible ? track.volume : 0;
    }
  }, [anySolo, state, stems]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const elements = stems.map((stem) => audioRefs.current.get(stem.id)).filter((audio): audio is HTMLAudioElement => Boolean(audio));
      const master = elements[0];
      if (master) {
        const now = master.currentTime;
        setPosition(now);
        if (loop.a !== null && loop.b !== null && now >= loop.b) {
          elements.forEach((audio) => (audio.currentTime = loop.a!));
        } else {
          // Keep followers within ~40 ms of the first track.
          for (const audio of elements.slice(1)) {
            if (Math.abs(audio.currentTime - now) > 0.04) audio.currentTime = now;
          }
        }
        if (master.ended) setPlaying(false);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [loop, playing, stems]);

  useEffect(() => () => audioRefs.current.forEach((audio) => audio.pause()), []);

  const all = () => stems.map((stem) => audioRefs.current.get(stem.id)).filter((audio): audio is HTMLAudioElement => Boolean(audio));

  const toggle = async () => {
    const elements = all();
    if (playing) {
      elements.forEach((audio) => audio.pause());
      setPlaying(false);
      return;
    }
    const start = elements[0]?.currentTime ?? 0;
    elements.forEach((audio) => (audio.currentTime = start));
    try {
      await Promise.all(elements.map((audio) => audio.play()));
      setPlaying(true);
    } catch {
      toast.error(t("Wiedergabe konnte nicht gestartet werden."));
    }
  };

  const seek = (seconds: number) => {
    all().forEach((audio) => (audio.currentTime = seconds));
    setPosition(seconds);
  };

  const upload = async (files: FileList) => {
    for (const [index, file] of Array.from(files).entries()) {
      setUploading(index + 1);
      const form = new FormData();
      form.append("file", file);
      form.append("label", file.name.replace(/\.[^.]+$/, ""));
      try {
        await uploadWithProgress(`/api/songs/${songId}/stems`, form, () => undefined).promise;
      } catch (error) {
        toast.error(`${file.name}: ${errorMessage(error)}`);
      }
    }
    setUploading(null);
    await mutate();
  };

  const remove = async (stemId: string, label: string) => {
    const ok = await confirm({ title: t(`Spur „${label}“ löschen?`), confirmLabel: t("Löschen"), tone: "danger" });
    if (!ok) return;
    await api.delete(`/api/songs/${songId}/stems/${stemId}`).catch((error) => toast.error(errorMessage(error)));
    await mutate();
  };

  if (stems.length === 0 && readOnly) return null;

  return (
    <Card>
      <CardHeader
        title={t("Mehrspur (Stems)")}
        icon={<Headphones />}
        description={t("Einzelspuren zum Üben – stummschalten, solo hören, Lautstärke regeln.")}
        action={!readOnly ? (
          <>
            <Button size="sm" icon={<Plus />} loading={uploading !== null} onClick={() => fileRef.current?.click()}>{t("Spuren")}</Button>
            <input ref={fileRef} type="file" accept={AUDIO_ACCEPT} multiple className="hidden" onChange={(event) => {
              if (event.target.files?.length) void upload(event.target.files);
              event.target.value = "";
            }} />
          </>
        ) : null}
      />
      {stems.length === 0 ? (
        <p className="text-sm text-muted">{t("Lade die Einzelspuren deiner Aufnahme hoch (Drums, Bass, Gitarre, Gesang …) – alle Spuren laufen synchron.")}</p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Button size="icon" variant="primary" onClick={() => void toggle()} aria-label={playing ? t("Pause") : t("Abspielen")}>
              {playing ? <Pause className="fill-current" /> : <Play className="fill-current" />}
            </Button>
            <input
              type="range"
              min={0}
              max={duration || 1}
              step={0.1}
              value={position}
              onChange={(event) => seek(Number(event.target.value))}
              className="flex-1 accent-[var(--accent)]"
              aria-label={t("Position")}
            />
            <span className="w-24 text-right text-xs tabular-nums text-muted">{clock(position)} / {clock(duration)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Repeat className="size-3.5 text-muted" />
            <Button size="sm" variant={loop.a !== null ? "secondary" : "ghost"} onClick={() => setLoop((current) => ({ ...current, a: position }))}>{t("A")} {loop.a !== null ? clock(loop.a) : t("setzen")}</Button>
            <Button size="sm" variant={loop.b !== null ? "secondary" : "ghost"} onClick={() => setLoop((current) => ({ ...current, b: current.a !== null && position > current.a ? position : null }))}>{t("B")} {loop.b !== null ? clock(loop.b) : t("setzen")}</Button>
            {loop.a !== null || loop.b !== null ? <Button size="sm" variant="ghost" onClick={() => setLoop({ a: null, b: null })}>{t("Loop aus")}</Button> : null}
          </div>
          <ul className="divide-y divide-border rounded-xl border border-border">
            {stems.map((stem) => {
              const track = trackState(stem.id);
              const audible = anySolo ? track.solo : !track.muted;
              const converting = stem.transcodeStatus === "pending";
              return (
                <li key={stem.id} className="flex items-center gap-2 px-3 py-2">
                  {/* Joins the mix once its MP3 is ready. */}
                  {!converting ? (
                    <audio
                      ref={(element) => {
                        if (element) audioRefs.current.set(stem.id, element);
                        else audioRefs.current.delete(stem.id);
                      }}
                      src={stem.fileUrl}
                      preload="auto"
                      onLoadedMetadata={(event) => setDuration((current) => Math.max(current, event.currentTarget.duration || 0))}
                    />
                  ) : null}
                  <span className={cn("min-w-0 flex-1 truncate text-sm font-medium", !audible && "text-subtle line-through")}>
                    {stem.label}
                    {converting ? <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-muted"><Loader2 className="size-3 animate-spin" />{t("Wird umgewandelt …")}</span> : null}
                  </span>
                  <button
                    type="button"
                    onClick={() => setState((current) => ({ ...current, [stem.id]: { ...track, muted: !track.muted } }))}
                    className={cn("inline-flex size-8 items-center justify-center rounded-lg text-xs font-bold", track.muted ? "bg-danger-soft text-danger" : "text-muted hover:bg-surface-2")}
                    aria-label={t("Stumm")}
                    title={t("Stumm")}
                  >
                    {track.muted ? <VolumeX className="size-4" /> : "M"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setState((current) => ({ ...current, [stem.id]: { ...track, solo: !track.solo } }))}
                    className={cn("inline-flex size-8 items-center justify-center rounded-lg text-xs font-bold", track.solo ? "bg-warning-soft text-warning" : "text-muted hover:bg-surface-2")}
                    aria-label={t("Solo")}
                    title={t("Solo")}
                  >
                    {t("S")}
                  </button>
                  <Volume2 className="hidden size-4 text-muted sm:block" />
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={track.volume}
                    onChange={(event) => setState((current) => ({ ...current, [stem.id]: { ...track, volume: Number(event.target.value) } }))}
                    className="w-20 accent-[var(--accent)] sm:w-28"
                    aria-label={t(`Lautstärke ${stem.label}`)}
                  />
                  <a
                    href={`${stem.originalFileUrl ?? stem.fileUrl}?download=1`}
                    className="hidden rounded-lg p-1.5 text-subtle hover:bg-surface-2 hover:text-fg sm:inline-flex"
                    aria-label={stem.originalFileUrl && stem.originalFileUrl !== stem.fileUrl ? originalLabel(stem.originalFileUrl) : t("Herunterladen")}
                    title={stem.originalFileUrl && stem.originalFileUrl !== stem.fileUrl ? originalLabel(stem.originalFileUrl) : t("Herunterladen")}
                  >
                    <Download className="size-4" />
                  </a>
                  {!readOnly ? (
                    <button type="button" onClick={() => void remove(stem.id, stem.label)} className="rounded-lg p-1.5 text-subtle hover:bg-danger-soft hover:text-danger" aria-label={t("Spur löschen")}>
                      <Trash2 className="size-4" />
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}

/* ---------------- Timestamp comments ---------------- */

async function computePeaks(url: string, buckets: number): Promise<number[]> {
  const response = await fetch(url, { credentials: "same-origin" });
  const buffer = await response.arrayBuffer();
  const Ctor = window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  const context = new Ctor(1, 1, 44100);
  const audio = await context.decodeAudioData(buffer);
  const data = audio.getChannelData(0);
  const size = Math.floor(data.length / buckets) || 1;
  const peaks: number[] = [];
  for (let bucket = 0; bucket < buckets; bucket += 1) {
    let max = 0;
    const start = bucket * size;
    for (let index = start; index < start + size && index < data.length; index += 16) {
      const value = Math.abs(data[index]);
      if (value > max) max = value;
    }
    peaks.push(max);
  }
  const top = Math.max(...peaks, 0.01);
  return peaks.map((peak) => peak / top);
}

/** Waveform with comment markers – click to jump, add a comment at the current position. */
export function AudioTimeline({ songId, audio, songTitle, initialSeek }: { songId: string; audio: AudioVersion; songTitle: string; initialSeek?: number }) {
  const player = usePlayer();
  const { me, band } = useSession();
  const { data, mutate } = useAudioComments(songId, audio.id);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [now, setNow] = useState(0);
  const [text, setText] = useState("");
  const [showResolved, setShowResolved] = useState(false);
  const toast = useToast();
  const isThis = player.track?.url === audio.fileUrl;
  const total = audio.durationSeconds ?? player.audioRef.current?.duration ?? 0;
  const comments = (data?.comments ?? []).filter((comment) => showResolved || !comment.resolvedAt);

  useEffect(() => {
    let cancelled = false;
    computePeaks(audio.fileUrl, 160).then((value) => !cancelled && setPeaks(value)).catch(() => !cancelled && setPeaks([]));
    return () => {
      cancelled = true;
    };
  }, [audio.fileUrl]);

  useEffect(() => {
    if (!isThis) return;
    const element = player.audioRef.current;
    if (!element) return;
    const update = () => setNow(element.currentTime);
    element.addEventListener("timeupdate", update);
    return () => element.removeEventListener("timeupdate", update);
  }, [isThis, player.audioRef]);

  const seekTo = (seconds: number) => {
    if (!isThis) {
      player.play({ url: audio.fileUrl, title: songTitle, subtitle: audio.fileName, songId });
      // Wait for the new source before seeking.
      setTimeout(() => {
        seekElement(player.audioRef.current, seconds);
      }, 300);
    } else if (player.audioRef.current) {
      seekElement(player.audioRef.current, seconds);
      if (!player.playing) player.toggle();
    }
    setNow(seconds);
  };

  const seekedInitially = useRef(false);
  useEffect(() => {
    if (initialSeek === undefined || seekedInitially.current) return;
    seekedInitially.current = true;
    const timeout = setTimeout(() => seekTo(initialSeek), 400);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSeek]);

  const add = async () => {
    if (!text.trim()) return;
    try {
      await api.post(`/api/songs/${songId}/audio/${audio.id}/comments`, { atSeconds: Math.round(now * 10) / 10, body: text.trim() });
      setText("");
      await mutate();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const resolve = async (commentId: string, resolved: boolean) => {
    await api.patch(`/api/songs/${songId}/audio/${audio.id}/comments/${commentId}`, { resolved }).catch((error) => toast.error(errorMessage(error)));
    await mutate();
  };

  const remove = async (commentId: string) => {
    await api.delete(`/api/songs/${songId}/audio/${audio.id}/comments/${commentId}`).catch((error) => toast.error(errorMessage(error)));
    await mutate();
  };

  const progress = total > 0 ? Math.min(1, now / total) : 0;

  return (
    <div className="space-y-3">
      <div
        className="relative h-16 cursor-pointer overflow-hidden rounded-xl bg-surface-2"
        onClick={(event) => {
          if (!total) return;
          const rect = event.currentTarget.getBoundingClientRect();
          seekTo(((event.clientX - rect.left) / rect.width) * total);
        }}
        role="slider"
        aria-label={t("Position in der Aufnahme")}
        aria-valuemin={0}
        aria-valuemax={Math.round(total)}
        aria-valuenow={Math.round(now)}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") seekTo(Math.min(total, now + 5));
          if (event.key === "ArrowLeft") seekTo(Math.max(0, now - 5));
        }}
      >
        <div className="absolute inset-0 flex items-center gap-px px-1">
          {(peaks ?? Array.from({ length: 160 }, () => 0.15)).map((peak, index, list) => (
            <span
              key={index}
              className={cn("flex-1 rounded-full", index / list.length <= progress ? "bg-accent" : "bg-border-strong", !peaks && "animate-pulse")}
              style={{ height: `${Math.max(6, peak * 100)}%` }}
            />
          ))}
        </div>
        {total > 0 ? comments.map((comment) => (
          <span
            key={comment.id}
            className={cn("absolute top-0 h-full w-0.5", comment.resolvedAt ? "bg-success/60" : "bg-warning")}
            style={{ left: `${(comment.atSeconds / total) * 100}%` }}
            title={`${clock(comment.atSeconds)} · ${comment.body}`}
          />
        )) : null}
      </div>

      {band?.role !== "guest" ? (
        <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void add(); }}>
          <span className="flex h-10 shrink-0 items-center rounded-lg bg-surface-2 px-2.5 text-xs tabular-nums text-muted">{t("bei")} {clock(now)}</span>
          <Input value={text} onChange={(event) => setText(event.target.value)} placeholder={t("z. B. „Bass hier zu früh“")} aria-label={t("Kommentar")} />
          <Button type="submit" icon={<MessageSquarePlus />} disabled={!text.trim()}>
            <span className="hidden sm:inline">{t("Kommentieren")}</span>
          </Button>
        </form>
      ) : null}

      {(data?.comments.length ?? 0) > 0 ? (
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
            <span>{comments.length} {t("Kommentare")}</span>
            <button type="button" className="hover:text-fg" onClick={() => setShowResolved((value) => !value)}>{showResolved ? t("Erledigte ausblenden") : t("Erledigte zeigen")}</button>
          </div>
          <ul className="space-y-1">
            {comments.map((comment) => (
              <li key={comment.id} className={cn("group flex items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface-2", comment.resolvedAt && "opacity-60")}>
                <button type="button" onClick={() => seekTo(comment.atSeconds)} className="mt-0.5 shrink-0 rounded-md bg-accent-soft px-1.5 py-0.5 text-xs font-medium tabular-nums text-accent-text">
                  {clock(comment.atSeconds)}
                </button>
                <Avatar name={comment.user?.displayName} src={comment.user?.avatarUrl} size="xs" />
                <p className={cn("min-w-0 flex-1 text-sm", comment.resolvedAt && "line-through")}>{comment.body}</p>
                <button type="button" onClick={() => void resolve(comment.id, !comment.resolvedAt)} className="rounded-md p-1 text-subtle hover:text-success" aria-label={comment.resolvedAt ? t("Wieder öffnen") : t("Erledigt")} title={comment.resolvedAt ? t("Wieder öffnen") : t("Erledigt")}>
                  <Check className="size-4" />
                </button>
                {comment.user?.id === me?.userId || band?.role === "owner" || band?.role === "admin" ? (
                  <button type="button" onClick={() => void remove(comment.id)} className="rounded-md p-1 text-subtle opacity-0 hover:text-danger group-hover:opacity-100" aria-label={t("Löschen")}>
                    <Trash2 className="size-4" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="text-[11px] text-subtle">{t("Dauer")} {formatDuration(total || null)} {t("· Klick in die Wellenform springt an die Stelle.")}</p>
    </div>
  );
}

/* ---------------- AI stem separation (optional, self-hosted Demucs service) ---------------- */

type SeparationJob = { id: string; status: "queued" | "running" | "importing" | "done" | "failed"; error: string | null } | null;

/** Starts / shows the separation of a recording into vocals, drums, bass and the rest. */
export function StemSeparation({ songId, audioId }: { songId: string; audioId: string }) {
  const { data, mutate } = useSWR<{ job: SeparationJob }>(`/api/songs/${songId}/audio/${audioId}/separate`, {
    refreshInterval: (latest) => (latest?.job && ["queued", "running", "importing"].includes(latest.job.status) ? 5000 : 0),
  });
  const stems = useSongStems(songId);
  const [starting, setStarting] = useState(false);
  const toast = useToast();
  const job = data?.job ?? null;
  const busy = Boolean(job && ["queued", "running", "importing"].includes(job.status));

  useEffect(() => {
    if (job?.status === "done") void stems.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status]);

  const start = async () => {
    setStarting(true);
    try {
      await api.post(`/api/songs/${songId}/audio/${audioId}/separate`);
      await mutate();
      toast.info(t("Spurtrennung gestartet – das dauert je nach Server ein paar Minuten."));
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-3 text-sm">
      <span className="min-w-0 flex-1">
        {busy ? t("Spuren werden getrennt …") : job?.status === "done" ? t("Spuren getrennt – siehe Mehrspur unten.") : job?.status === "failed" ? `Fehlgeschlagen: ${job.error ?? "unbekannt"}` : t("In Gesang, Drums, Bass und Rest trennen (KI, läuft auf eurem Server).")}
      </span>
      {busy ? <span className="size-4 animate-spin rounded-full border-2 border-accent border-t-transparent" aria-hidden /> : (
        <Button size="sm" loading={starting} onClick={() => void start()}>{job ? t("Erneut trennen") : t("Spuren trennen")}</Button>
      )}
    </div>
  );
}
