"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft, ChevronDown, ChevronUp, Eye, EyeOff, FileText, ListMusic, Minus, MoreHorizontal, Music2, Pause, Pencil, Play, Plus, Trash2, Type,
} from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import { saveDoc, useSaveFeedback } from "@/lib/client/sync";
import { formatBpm, formatDate, formatDuration, formatRelative, SONG_STATUS_LABEL } from "@/lib/client/format";
import { useSong, useSongParts } from "@/lib/client/hooks";
import { useRevalidate } from "@/lib/client/mutations";
import { toSpotifyEmbedUrl, toYouTubeEmbedUrl, transposeKey } from "@/lib/client/music";
import { roleCan } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardHeader, EmptyState, Skeleton } from "@/components/ui/display";
import { Menu, Segmented, Tabs } from "@/components/ui/navigation";
import { useConfirm, useToast } from "@/components/ui/feedback";
import { usePlayer } from "@/components/providers/player";
import { useSession } from "@/components/providers/session";
import { ChordSheet, LyricsText } from "@/components/songs/chord-sheet";
import { EditSongDialog } from "@/components/songs/edit-song-dialog";
import { LeadSheetEditor } from "@/components/songs/leadsheet-editor";
import { Metronome } from "@/components/songs/metronome";
import { SongDiscussion } from "@/components/songs/song-discussion";
import { SongFiles } from "@/components/songs/song-files";
import { PartActions, PartEditor, PartView } from "@/components/songs/song-parts";
import { SongScores } from "@/components/songs/song-scores";
import { STATUS_TONE } from "@/components/songs/songs-view";
import { TaskBoard } from "@/components/tasks/task-board";
import { t } from "@/lib/i18n";
import { ExternalEmbed } from "@/components/legal/external-embed";
import { ClickTrackButton, DetectedSuggestion } from "@/components/songs/song-insights";

type Tab = "sheet" | "scores" | "files" | "discussion" | "tasks" | "details";

function MetaPill({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center rounded-lg bg-surface-2 px-2.5 py-1 text-[13px] font-medium">{children}</span>;
}

export function SongDetailView({ songId }: { songId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const { data, error, isLoading, mutate } = useSong(songId);
  const partsQuery = useSongParts(songId);
  const [partId, setPartId] = useState<string | null>(null);
  const [newPartOpen, setNewPartOpen] = useState(false);
  const { me, band } = useSession();
  const player = usePlayer();
  const confirm = useConfirm();
  const toast = useToast();
  const feedback = useSaveFeedback();
  const revalidate = useRevalidate();

  const [tab, setTab] = useState<Tab>((params.get("tab") as Tab | null) ?? "sheet");
  const [editOpen, setEditOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [transpose, setTranspose] = useState(0);
  const [fontSize, setFontSize] = useState(17);
  const [showChords, setShowChords] = useState(true);
  const [sheetMode, setSheetMode] = useState<"chords" | "lyrics">("chords");

  const song = data?.song;
  const applySuggestion = async (values: { tempoBpm?: number; keySignature?: string }) => {
    const current = data?.song;
    if (!current) return;
    feedback(await saveDoc({ url: `/api/songs/${current.id}`, body: { ...values, baseRevision: current.revision ?? null }, key: `song:${current.id}`, title: current.title }));
    void mutate();
  };

  const refresh = () => {
    void mutate();
    void revalidate("/api/songs?", "/api/albums");
  };

  const embedUrl = useMemo(() => toSpotifyEmbedUrl(song?.spotifyUrl) ?? toYouTubeEmbedUrl(song?.spotifyUrl), [song?.spotifyUrl]);

  if (error) {
    return (
      <EmptyState
        icon={<Music2 />}
        title={t("Song nicht gefunden")}
        description={errorMessage(error)}
        action={<Button onClick={() => router.push("/app/songs")}>{t("Zu den Songs")}</Button>}
      />
    );
  }

  if (isLoading || !song) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const current = song.audioVersions.find((audio) => audio.isCurrent) ?? song.audioVersions[0];
  const playingThis = Boolean(current && player.track?.url === current.fileUrl && player.playing);
  const readOnly = band?.role === "guest";
  const canDelete = roleCan(band?.role, "songs.delete") || song.creator?.id === me?.userId;
  const parts = partsQuery.data?.parts ?? [];
  const activePart = parts.find((part) => part.id === partId) ?? null;
  const lyrics = song.lyricsRevisions[0]?.lyricsMarkdown ?? "";
  const hasChords = Boolean(song.chordProText?.trim());
  const hasLyrics = Boolean(lyrics.trim());
  const mode = hasChords && hasLyrics ? sheetMode : hasChords ? "chords" : "lyrics";

  const remove = async () => {
    const ok = await confirm({
      title: t(`„${song.title}“ löschen?`),
      description: song.setlistItems.length > 0
        ? t(`Der Song wird auch aus ${song.setlistItems.length} Setlist(s) entfernt. Aufnahmen und Dateien werden gelöscht.`)
        : t("Aufnahmen, Dateien und Diskussionen werden ebenfalls gelöscht."),
      confirmLabel: t("Löschen"),
      tone: "danger",
    });
    if (!ok) return;
    try {
      await api.delete(`/api/songs/${song.id}`);
      await revalidate("/api/songs", "/api/setlists", "/api/albums");
      toast.success(t("Song gelöscht."));
      router.push("/app/songs");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const updateStatus = async (status: typeof song.workflowStatus) => {
    try {
      feedback(await saveDoc({ url: `/api/songs/${song.id}`, body: { workflowStatus: status, baseRevision: song.revision ?? null }, key: `song:${song.id}`, title: song.title }));
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div>
      <Link href={readOnly ? "/app/setlists" : "/app/songs"} className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4" /> {readOnly ? t("Setlists") : t("Songs")}
      </Link>

      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{song.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {readOnly ? null : <Menu
              align="start"
              trigger={({ toggle }) => (
                <button type="button" onClick={toggle} className="inline-flex items-center gap-1">
                  <Badge tone={STATUS_TONE[song.workflowStatus]} dot>{SONG_STATUS_LABEL[song.workflowStatus]}</Badge>
                  <ChevronDown className="size-3 text-muted" />
                </button>
              )}
              items={(Object.keys(SONG_STATUS_LABEL) as Array<typeof song.workflowStatus>).map((status) => ({
                label: SONG_STATUS_LABEL[status],
                onSelect: () => void updateStatus(status),
              }))}
            />}
            {song.keySignature ? <MetaPill>{transposeKey(song.keySignature, transpose)}</MetaPill> : null}
            {formatBpm(song.tempoBpm) ? <MetaPill>{formatBpm(song.tempoBpm)}</MetaPill> : null}
            {song.timeSignature ? <MetaPill>{song.timeSignature}</MetaPill> : null}
            {song.durationSeconds ? <MetaPill>{formatDuration(song.durationSeconds)}</MetaPill> : null}
            {song.album ? <Link href={`/app/albums/${song.album.id}`}><MetaPill>{song.album.title}</MetaPill></Link> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {current ? (
            <Button
              variant="primary"
              icon={playingThis ? <Pause className="fill-current" /> : <Play className="fill-current" />}
              onClick={() => (player.track?.url === current.fileUrl
                ? player.toggle()
                : player.play({ url: current.fileUrl, title: song.title, subtitle: current.fileName, songId: song.id }))}
            >
              {playingThis ? t("Pause") : t("Anhören")}
            </Button>
          ) : null}
          {readOnly ? null : <Button icon={<Pencil />} onClick={() => setEditOpen(true)}>{t("Bearbeiten")}</Button>}
          {readOnly ? null : <Menu
            trigger={({ toggle }) => <Button size="icon" onClick={toggle} aria-label={t("Weitere Aktionen")}><MoreHorizontal /></Button>}
            items={[
              { label: t("Lead Sheet bearbeiten"), icon: <FileText />, onSelect: () => setSheetOpen(true) },
              { type: "separator" },
              { label: t("Song löschen"), icon: <Trash2 />, danger: true, disabled: !canDelete, onSelect: () => void remove() },
            ]}
          />}
        </div>
      </header>

      <Tabs
        className="mb-5"
        value={tab}
        onChange={setTab}
        items={[
          { value: "sheet", label: t("Lead Sheet") },
          { value: "scores", label: t("Noten") },
          { value: "files", label: t("Aufnahmen & Dateien"), count: song.audioVersions.length + song.attachments.length },
          ...(readOnly ? [] : [
            { value: "discussion" as const, label: t("Diskussion"), count: song.threads.length },
            { value: "tasks" as const, label: t("Aufgaben") },
          ]),
          { value: "details", label: t("Details") },
        ]}
      />

      {tab === "sheet" && (parts.length > 0 || !readOnly) ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {parts.length > 0 ? (
            <Segmented
              size="sm"
              value={partId ?? "main"}
              onChange={(value) => setPartId(value === "main" ? null : value)}
              items={[{ value: "main", label: t("Lead Sheet") }, ...parts.map((part) => ({ value: part.id, label: part.instrument }))]}
            />
          ) : null}
          {!readOnly ? (
            <div className="ml-auto flex items-center gap-1">
              <PartActions songId={song.id} part={activePart} onChanged={() => void partsQuery.mutate()} onCreate={() => setNewPartOpen(true)} />
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "sheet" && activePart ? (
        <Card>
          <div className="mb-3 flex items-center justify-between text-xs text-muted">
            <span>{t("Stimme")} {activePart.instrument}{activePart.updatedBy ? t(` · zuletzt von ${activePart.updatedBy.displayName}`) : ""}</span>
            <span>{formatRelative(activePart.updatedAt)}</span>
          </div>
          <PartView part={activePart} transpose={transpose} fontSize={fontSize} />
        </Card>
      ) : null}

      {tab === "sheet" && !activePart ? (
        hasChords || hasLyrics ? (
          <Card padded={false}>
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5 sm:px-4">
              {hasChords && hasLyrics ? (
                <Segmented size="sm" value={mode} onChange={setSheetMode} items={[{ value: "chords", label: t("Akkorde") }, { value: "lyrics", label: t("Text") }]} />
              ) : null}
              {mode === "chords" ? (
                <div className="flex items-center gap-1 rounded-lg bg-surface-2 p-0.5">
                  <Button size="icon-sm" variant="ghost" onClick={() => setTranspose((value) => value - 1)} aria-label={t("Halbton tiefer")}><ChevronDown /></Button>
                  <span className="min-w-16 text-center text-xs font-medium tabular-nums" title={t("Transponieren")}>
                    {transpose === 0 ? t("Original") : `${transpose > 0 ? "+" : ""}${transpose}`}
                  </span>
                  <Button size="icon-sm" variant="ghost" onClick={() => setTranspose((value) => value + 1)} aria-label={t("Halbton höher")}><ChevronUp /></Button>
                </div>
              ) : null}
              <div className="flex items-center gap-1 rounded-lg bg-surface-2 p-0.5">
                <Button size="icon-sm" variant="ghost" onClick={() => setFontSize((value) => Math.max(12, value - 2))} aria-label={t("Schrift kleiner")}><Minus /></Button>
                <Type className="size-3.5 text-muted" />
                <Button size="icon-sm" variant="ghost" onClick={() => setFontSize((value) => Math.min(34, value + 2))} aria-label={t("Schrift größer")}><Plus /></Button>
              </div>
              {mode === "chords" ? (
                <Button size="sm" variant="ghost" icon={showChords ? <EyeOff /> : <Eye />} onClick={() => setShowChords((value) => !value)}>
                  <span className="hidden sm:inline">{showChords ? t("Akkorde aus") : t("Akkorde an")}</span>
                </Button>
              ) : null}
              <div className="ml-auto flex items-center gap-2">
                <div className="hidden md:block"><Metronome initialBpm={Number(song.tempoBpm) || undefined} compact /></div>
                {readOnly ? null : <Button size="sm" icon={<Pencil />} onClick={() => setSheetOpen(true)}>{t("Bearbeiten")}</Button>}
              </div>
            </div>
            <div className="overflow-x-auto px-4 py-5 sm:px-6">
              {mode === "chords"
                ? <ChordSheet text={song.chordProText ?? ""} transpose={transpose} fontSize={fontSize} showChords={showChords} />
                : <LyricsText text={lyrics} fontSize={fontSize} />}
            </div>
            <div className="border-t border-border px-4 py-3 md:hidden">
              <Metronome initialBpm={Number(song.tempoBpm) || undefined} compact />
            </div>
          </Card>
        ) : (
          <EmptyState
            icon={<FileText />}
            title={t("Noch kein Lead Sheet")}
            description={t("Füge Text und Akkorde im ChordPro-Format ein – oder einfach „Akkorde über Text“. Transponieren inklusive.")}
            action={readOnly ? undefined : <Button variant="primary" icon={<Plus />} onClick={() => setSheetOpen(true)}>{t("Lead Sheet anlegen")}</Button>}
          />
        )
      ) : null}

      {tab === "scores" ? <SongScores song={song} readOnly={readOnly} /> : null}
      {tab === "files" ? <SongFiles song={song} onChanged={refresh} readOnly={readOnly} /> : null}
      {tab === "discussion" ? <SongDiscussion song={song} onChanged={refresh} /> : null}
      {tab === "tasks" ? <TaskBoard songId={song.id} /> : null}

      {tab === "details" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title={t("Infos")} />
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-sm">
              <dt className="text-muted">{t("Status")}</dt><dd>{SONG_STATUS_LABEL[song.workflowStatus]}</dd>
              <dt className="text-muted">{t("Tonart")}</dt><dd>{song.keySignature ?? "–"}</dd>
              <dt className="text-muted">{t("Tempo")}</dt><dd>{formatBpm(song.tempoBpm) ?? "–"}</dd>
              <dt className="text-muted">{t("Taktart")}</dt><dd>{song.timeSignature ?? "–"}</dd>
              <dt className="text-muted">{t("Dauer")}</dt><dd>{formatDuration(song.durationSeconds)}</dd>
              <dt className="text-muted">{t("Album")}</dt><dd>{song.album ? `${song.album.title}${song.albumTrackNo ? ` · Track ${song.albumTrackNo}` : ""}` : "–"}</dd>
              <dt className="text-muted">{t("Angelegt")}</dt><dd>{formatDate(song.createdAt)}{song.creator ? t(" von {name}", { name: song.creator.displayName }) : ""}</dd>
              <dt className="text-muted">{t("Geändert")}</dt><dd>{formatRelative(song.updatedAt)}</dd>
              <dt className="text-muted">{t("Textversionen")}</dt><dd>{song._count.lyricsRevisions}</dd>
              {song.composers || song.lyricists || song.publisher || song.gemaWorkNumber ? (
                <>
                  <dt className="text-muted">{t("Komponist:innen")}</dt><dd>{song.composers || "–"}</dd>
                  {song.lyricists ? <><dt className="text-muted">{t("Texter:innen")}</dt><dd>{song.lyricists}</dd></> : null}
                  {song.publisher ? <><dt className="text-muted">{t("Verlag")}</dt><dd>{song.publisher}</dd></> : null}
                  {song.gemaWorkNumber ? <><dt className="text-muted">{t("GEMA-Werknummer")}</dt><dd className="font-mono text-[13px]">{song.gemaWorkNumber}</dd></> : null}
                </>
              ) : null}
            </dl>
            {!readOnly ? <DetectedSuggestion song={song} onApply={(values) => void applySuggestion(values)} /> : null}
            <ClickTrackButton songId={song.id} hasTempo={Boolean(song.tempoBpm)} />
            {song.notes ? (
              <div className="mt-5 rounded-xl bg-surface-2 p-3.5 text-sm whitespace-pre-wrap">{song.notes}</div>
            ) : null}
          </Card>
          <div className="space-y-6">
            <Card>
              <CardHeader title={t("In Setlists")} icon={<ListMusic />} />
              {song.setlistItems.length === 0 ? (
                <p className="text-sm text-muted">{t("Noch in keiner Setlist.")}</p>
              ) : (
                <ul className="space-y-1">
                  {song.setlistItems.map((item) => (
                    <li key={item.setlist.id}>
                      <Link href={`/app/setlists/${item.setlist.id}`} className="-mx-2 block rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2">{item.setlist.name}</Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            {embedUrl ? (
              <Card padded={false} className="overflow-hidden">
                <ExternalEmbed
                  src={embedUrl}
                  title={t("Referenz: {title}", { title: song.title })}
                  provider={embedUrl.includes("youtube") ? "YouTube" : "Spotify"}
                  className={embedUrl.includes("youtube") ? "aspect-video w-full" : "h-[152px] w-full"}
                />
              </Card>
            ) : song.spotifyUrl ? (
              <a href={song.spotifyUrl} target="_blank" rel="noreferrer" className="text-sm text-accent-text hover:underline">{t("Referenz öffnen")}</a>
            ) : null}
          </div>
        </div>
      ) : null}

      {newPartOpen ? (
        <PartEditor
          songId={song.id}
          part={null}
          open={newPartOpen}
          onClose={() => setNewPartOpen(false)}
          onSaved={(part) => {
            void partsQuery.mutate();
            setPartId(part.id);
          }}
        />
      ) : null}
      <EditSongDialog song={song} open={editOpen} onClose={() => setEditOpen(false)} onSaved={refresh} />
      <LeadSheetEditor song={song} open={sheetOpen} onClose={() => setSheetOpen(false)} onSaved={refresh} />
    </div>
  );
}
