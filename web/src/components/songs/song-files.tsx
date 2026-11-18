"use client";

/* eslint-disable @next/next/no-img-element -- previews are served by the authenticated uploads route */
import dynamic from "next/dynamic";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download, FileAudio, FileImage, FileMusic, FileText, MessageSquare, MoreHorizontal, Pause, Pencil, Play, SlidersHorizontal, Star, Trash2 } from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import { cn } from "@/lib/client/cn";
import { formatBytes, formatDate, formatDuration } from "@/lib/client/format";
import { useUploadQueue } from "@/lib/client/use-upload-queue";
import type { Attachment, AttachmentKind, SongDetail } from "@/lib/client/types";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardHeader } from "@/components/ui/display";
import { Select } from "@/components/ui/form";
import { Menu } from "@/components/ui/navigation";
import { useConfirm, useToast } from "@/components/ui/feedback";
import { usePlayer } from "@/components/providers/player";
import { UploadList, UploadZone } from "@/components/songs/upload-zone";
import { AudioTimeline, StemMixer, StemSeparation } from "@/components/songs/song-audio-extras";
import { useAiStatus } from "@/lib/client/hooks";
import { PracticeMixer } from "@/components/songs/practice-mixer";

const SheetMusic = dynamic(() => import("@/components/songs/sheet-music").then((module) => module.SheetMusic), {
  ssr: false,
  loading: () => <p className="py-6 text-center text-sm text-muted">Noten werden geladen …</p>,
});

export const ATTACHMENT_KIND_LABEL: Record<AttachmentKind, string> = {
  lead_sheet: "Lead Sheet",
  score_pdf: "Noten (PDF)",
  score_musicxml: "MusicXML",
  score_image: "Noten (Bild)",
  lyrics_doc: "Text",
  other: "Datei",
};

function AttachmentIcon({ attachment }: { attachment: Attachment }) {
  if (attachment.kind === "score_musicxml") return <FileMusic />;
  if (attachment.kind === "score_image" || attachment.mimeType?.startsWith("image/")) return <FileImage />;
  if (attachment.mimeType?.startsWith("audio/")) return <FileAudio />;
  return <FileText />;
}

export function SongFiles({ song, onChanged, readOnly = false }: { song: SongDetail; onChanged: () => void; readOnly?: boolean }) {
  const params = useSearchParams();
  const linkedAudio = params.get("audio");
  const linkedTime = params.get("t");
  const [feedbackFor, setFeedbackFor] = useState<string | null>(linkedAudio);
  const [mixerFor, setMixerFor] = useState<string | null>(null);
  const ai = useAiStatus();
  const player = usePlayer();
  const confirm = useConfirm();
  const toast = useToast();
  const [kind, setKind] = useState<AttachmentKind | "auto">("auto");
  const [showScore, setShowScore] = useState<string | null>(null);

  const audioQueue = useUploadQueue({ endpoint: `/api/songs/${song.id}/audio`, audio: true, onUploaded: onChanged });
  const fileQueue = useUploadQueue({ endpoint: `/api/songs/${song.id}/attachments`, onUploaded: onChanged });

  const run = async (action: () => Promise<unknown>, success?: string) => {
    try {
      await action();
      onChanged();
      if (success) toast.success(success);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const rename = async (url: string, current: string) => {
    const name = await confirm({ title: "Umbenennen", confirmLabel: "Speichern", input: { defaultValue: current } });
    if (typeof name === "string" && name.trim() && name.trim() !== current) {
      await run(() => api.patch(url, { fileName: name.trim() }));
    }
  };

  const remove = async (url: string, name: string) => {
    const ok = await confirm({ title: `„${name}“ löschen?`, confirmLabel: "Löschen", tone: "danger" });
    if (ok) await run(() => api.delete(url), "Gelöscht.");
  };

  const musicXml = song.attachments.filter((attachment) => attachment.kind === "score_musicxml");
  const images = song.attachments.filter((attachment) => attachment.kind === "score_image" || attachment.mimeType?.startsWith("image/"));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Aufnahmen" description="Proberaum-Mitschnitte, Demos, Referenzen – jede Version bleibt erhalten." />
        {song.audioVersions.length > 0 ? (
          <ul className="mb-4 divide-y divide-border overflow-hidden rounded-xl border border-border">
            {song.audioVersions.map((audio) => {
              const active = player.track?.url === audio.fileUrl;
              return (
                <li key={audio.id} className={cn("px-3 py-2.5", audio.isCurrent && "bg-accent-soft/40")}>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => (active ? player.toggle() : player.play({ url: audio.fileUrl, title: song.title, subtitle: `V${audio.versionNumber} · ${audio.fileName}`, songId: song.id }))}
                    className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg transition-colors hover:bg-accent hover:text-accent-fg"
                    aria-label={active && player.playing ? "Pause" : `${audio.fileName} abspielen`}
                  >
                    {active && player.playing ? <Pause className="size-3.5 fill-current" /> : <Play className="ml-0.5 size-3.5 fill-current" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{audio.fileName}</span>
                      {audio.isCurrent ? <Badge tone="accent">Aktuell</Badge> : null}
                    </div>
                    <div className="text-xs text-muted">
                      Version {audio.versionNumber} · {formatDate(audio.uploadedAt)}{audio.durationSeconds ? ` · ${formatDuration(audio.durationSeconds)}` : ""}
                    </div>
                  </div>
                  <Button
                    variant={mixerFor === audio.id ? "secondary" : "ghost"}
                    size="sm"
                    icon={<SlidersHorizontal />}
                    onClick={() => setMixerFor((current) => (current === audio.id ? null : audio.id))}
                    aria-label="Übungsmixer"
                    title="Übungsmixer: Gesang, Bass, Seiten regeln"
                  >
                    <span className="hidden sm:inline">Mixer</span>
                  </Button>
                  <Button
                    variant={feedbackFor === audio.id ? "secondary" : "ghost"}
                    size="sm"
                    icon={<MessageSquare />}
                    onClick={() => setFeedbackFor((current) => (current === audio.id ? null : audio.id))}
                    aria-label="Zeitmarken-Feedback"
                  >
                    <span className="hidden sm:inline">Feedback</span>
                  </Button>
                  {!readOnly ? <Menu
                    trigger={({ toggle }) => (
                      <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label="Aktionen"><MoreHorizontal /></Button>
                    )}
                    items={[
                      ...(!audio.isCurrent ? [{ label: "Als aktuell markieren", icon: <Star />, onSelect: () => void run(() => api.patch(`/api/songs/${song.id}/audio/${audio.id}`, { isCurrent: true })) }] : []),
                      { label: "Umbenennen", icon: <Pencil />, onSelect: () => void rename(`/api/songs/${song.id}/audio/${audio.id}`, audio.fileName) },
                      { label: "Herunterladen", icon: <Download />, onSelect: () => window.open(`${audio.fileUrl}?download=1`, "_blank") },
                      { type: "separator" as const },
                      { label: "Löschen", icon: <Trash2 />, danger: true, onSelect: () => void remove(`/api/songs/${song.id}/audio/${audio.id}`, audio.fileName) },
                    ]}
                  /> : null}
                </div>
                {mixerFor === audio.id ? (
                  <div className="mt-3 space-y-3">
                    <PracticeMixer audio={audio} />
                    {ai.data?.stemSeparation && !readOnly ? <StemSeparation songId={song.id} audioId={audio.id} /> : null}
                  </div>
                ) : null}
                {feedbackFor === audio.id ? (
                  <div className="mt-3">
                    <AudioTimeline
                      songId={song.id}
                      audio={audio}
                      songTitle={song.title}
                      initialSeek={linkedAudio === audio.id && linkedTime ? Number(linkedTime) : undefined}
                    />
                  </div>
                ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
        {!readOnly ? (
          <>
            <UploadZone
              onFiles={(files) => audioQueue.add(files)}
              accept="audio/*,.m4a,.flac,.aif,.aiff,.opus"
              label="Aufnahme hochladen"
              hint="MP3, WAV, M4A, FLAC … bis 250 MB – oder hierher ziehen"
            />
            <UploadList items={audioQueue.items} onRetry={audioQueue.retry} onRemove={audioQueue.remove} onCancel={audioQueue.cancel} />
          </>
        ) : song.audioVersions.length === 0 ? <p className="text-sm text-muted">Keine Aufnahmen.</p> : null}
      </Card>

      <StemMixer songId={song.id} readOnly={readOnly} />

      <Card>
        <CardHeader
          title="Noten & Dateien"
          description="PDFs, MusicXML, Fotos von Notenblättern, Texte."
          action={readOnly ? undefined : (
            <Select value={kind} onChange={(event) => setKind(event.target.value as AttachmentKind | "auto")} className="h-8 min-h-8 w-40 py-0 text-[13px]" aria-label="Dateityp">
              <option value="auto">Typ automatisch</option>
              {(Object.keys(ATTACHMENT_KIND_LABEL) as AttachmentKind[]).map((value) => (
                <option key={value} value={value}>{ATTACHMENT_KIND_LABEL[value]}</option>
              ))}
            </Select>
          )}
        />

        {images.length > 0 ? (
          <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {images.map((image) => (
              <a key={image.id} href={image.fileUrl} target="_blank" rel="noreferrer" className="aspect-[3/4] overflow-hidden rounded-xl border border-border bg-surface-2">
                <img src={image.fileUrl} alt={image.fileName} className="size-full object-cover" loading="lazy" />
              </a>
            ))}
          </div>
        ) : null}

        {song.attachments.length > 0 ? (
          <ul className="mb-4 divide-y divide-border overflow-hidden rounded-xl border border-border">
            {song.attachments.map((attachment) => (
              <li key={attachment.id} className="flex items-center gap-3 px-3 py-2.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted [&_svg]:size-4">
                  <AttachmentIcon attachment={attachment} />
                </span>
                <a href={attachment.fileUrl} target="_blank" rel="noreferrer" className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium hover:underline">{attachment.fileName}</span>
                  <span className="text-xs text-muted">
                    {ATTACHMENT_KIND_LABEL[attachment.kind]}{attachment.fileSizeBytes ? ` · ${formatBytes(attachment.fileSizeBytes)}` : ""} · {formatDate(attachment.createdAt)}
                  </span>
                </a>
                {attachment.kind === "score_musicxml" ? (
                  <Button size="sm" variant="subtle" onClick={() => setShowScore((current) => (current === attachment.id ? null : attachment.id))}>
                    {showScore === attachment.id ? "Ausblenden" : "Anzeigen"}
                  </Button>
                ) : null}
                {readOnly ? (
                  <Button variant="ghost" size="icon-sm" aria-label="Herunterladen" onClick={() => window.open(`${attachment.fileUrl}?download=1`, "_blank")}><Download /></Button>
                ) : <Menu
                  trigger={({ toggle }) => <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label="Aktionen"><MoreHorizontal /></Button>}
                  items={[
                    { label: "Umbenennen", icon: <Pencil />, onSelect: () => void rename(`/api/songs/${song.id}/attachments/${attachment.id}`, attachment.fileName) },
                    { label: "Herunterladen", icon: <Download />, onSelect: () => window.open(`${attachment.fileUrl}?download=1`, "_blank") },
                    { type: "separator" as const },
                    { label: "Löschen", icon: <Trash2 />, danger: true, onSelect: () => void remove(`/api/songs/${song.id}/attachments/${attachment.id}`, attachment.fileName) },
                  ]}
                />}
              </li>
            ))}
          </ul>
        ) : null}

        {!readOnly ? (
          <>
            <UploadZone
              onFiles={(files) => fileQueue.add(files, kind === "auto" ? undefined : { kind })}
              label="Datei hochladen"
              hint="PDF, MusicXML, Bilder, Texte … bis 120 MB"
            />
            <UploadList items={fileQueue.items} onRetry={fileQueue.retry} onRemove={fileQueue.remove} onCancel={fileQueue.cancel} />
          </>
        ) : null}
      </Card>

      {showScore ? (
        <Card>
          <CardHeader title="Notenansicht" description={musicXml.find((entry) => entry.id === showScore)?.fileName} />
          <SheetMusic url={musicXml.find((entry) => entry.id === showScore)?.fileUrl ?? ""} />
        </Card>
      ) : null}
    </div>
  );
}
