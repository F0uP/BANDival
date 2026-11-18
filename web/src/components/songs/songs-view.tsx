"use client";

/* eslint-disable @next/next/no-img-element -- album covers are served by the authenticated uploads route */
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, Disc3, FileText, MessageSquare, Music2, Pause, Play, Plus, Search, Upload } from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import { cn } from "@/lib/client/cn";
import { formatBpm, formatDuration, formatRelative, formatTotalDuration, SONG_STATUS_LABEL, SONG_STATUS_ORDER } from "@/lib/client/format";
import { useAlbums, useSongs } from "@/lib/client/hooks";
import { useRevalidate } from "@/lib/client/mutations";
import type { SongListItem, SongStatus } from "@/lib/client/types";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, PageHeader, SkeletonList } from "@/components/ui/display";
import { Input, Select } from "@/components/ui/form";
import { Tabs } from "@/components/ui/navigation";
import { useConfirm, useToast } from "@/components/ui/feedback";
import { usePlayer } from "@/components/providers/player";
import { useSession } from "@/components/providers/session";
import { CreateSongDialog } from "@/components/songs/create-song-dialog";
import { ImportDialog } from "@/components/songs/import-dialog";

export const STATUS_TONE: Record<SongStatus, "neutral" | "warning" | "success" | "accent"> = {
  draft: "neutral",
  review: "warning",
  approved: "success",
  archived: "neutral",
};

type Sort = "updated" | "title" | "tempo" | "status";

function SongRow({ song }: { song: SongListItem }) {
  const player = usePlayer();
  const audio = song.audioVersions[0];
  const isCurrent = player.track?.url === audio?.fileUrl;
  const meta = [song.keySignature, formatBpm(song.tempoBpm), song.durationSeconds ? formatDuration(song.durationSeconds) : null].filter(Boolean);

  return (
    <li className="group relative flex items-center gap-3 px-3 py-3 transition-colors hover:bg-surface-2/60 sm:px-4">
      <button
        type="button"
        disabled={!audio}
        onClick={() => {
          if (!audio) return;
          if (isCurrent) player.toggle();
          else player.play({ url: audio.fileUrl, title: song.title, subtitle: audio.fileName, songId: song.id });
        }}
        className={cn(
          "relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full transition-[background-color,color,transform] duration-200 active:scale-90",
          audio ? (isCurrent && player.playing ? "bg-accent text-accent-fg" : "bg-fg/[0.06] text-fg hover:bg-ink hover:text-ink-fg") : "bg-fg/[0.035] text-subtle",
        )}
        aria-label={audio ? (isCurrent && player.playing ? "Pause" : `${song.title} abspielen`) : "Keine Aufnahme"}
      >
        {audio ? (isCurrent && player.playing ? <Pause className="size-4 fill-current" /> : <Play className="ml-0.5 size-4 fill-current" />) : <Music2 className="size-4" />}
      </button>
      <Link href={`/app/songs/${song.id}`} className="min-w-0 flex-1 after:absolute after:inset-0">
        <span className="block truncate font-medium">{song.title}</span>
        <span className="type-meta mt-0.5 flex items-center gap-1.5 truncate text-muted">
          {song.album ? <span className="truncate">{song.album.title}</span> : null}
          {song.album && meta.length > 0 ? <span>·</span> : null}
          {meta.join(" · ") || (!song.album ? `Geändert ${formatRelative(song.updatedAt)}` : null)}
        </span>
      </Link>
      <div className="hidden items-center gap-3 text-xs text-muted md:flex">
        {song._count.attachments > 0 ? <span className="flex items-center gap-1" title="Dateien"><FileText className="size-3.5" />{song._count.attachments}</span> : null}
        {song._count.threads > 0 ? <span className="flex items-center gap-1" title="Diskussionen"><MessageSquare className="size-3.5" />{song._count.threads}</span> : null}
      </div>
      <Badge tone={STATUS_TONE[song.workflowStatus]} className="hidden sm:inline-flex">{SONG_STATUS_LABEL[song.workflowStatus]}</Badge>
      <ChevronRight className="size-4 shrink-0 text-subtle" />
    </li>
  );
}

function AlbumsGrid() {
  const { bandId, can } = useSession();
  const albums = useAlbums(bandId);
  const confirm = useConfirm();
  const toast = useToast();
  const revalidate = useRevalidate();
  const router = useRouter();

  const createAlbum = async () => {
    const title = await confirm({ title: "Neues Album", confirmLabel: "Album anlegen", input: { label: "Titel", placeholder: "z. B. Debut EP" } });
    if (typeof title !== "string" || !title.trim() || !bandId) return;
    try {
      const result = await api.post<{ album: { id: string } }>("/api/albums", { bandId, title: title.trim() });
      await revalidate("/api/albums");
      router.push(`/app/albums/${result.album.id}`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  if (albums.isLoading) return <SkeletonList rows={3} />;
  const list = albums.data?.albums ?? [];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {list.map((album) => (
        <Link key={album.id} href={`/app/albums/${album.id}`} className="group">
          <div className="aspect-square overflow-hidden rounded-2xl border border-border bg-surface-2">
            {album.coverUrl ? (
              <img src={album.coverUrl} alt="" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" loading="lazy" />
            ) : (
              <div className="flex size-full items-center justify-center text-subtle"><Disc3 className="size-10" /></div>
            )}
          </div>
          <div className="mt-2 truncate text-sm font-medium">{album.title}</div>
          <div className="text-xs text-muted">
            {album.songs.length} Songs · {formatTotalDuration(album.songs.reduce((sum, song) => sum + (song.durationSeconds ?? 0), 0))}
          </div>
        </Link>
      ))}
      {can("songs.create") ? (
        <button type="button" onClick={() => void createAlbum()} className="flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-sm text-muted transition-colors hover:border-border-strong hover:text-fg">
          <Plus className="size-5" />
          Neues Album
        </button>
      ) : null}
    </div>
  );
}

export function SongsView() {
  const router = useRouter();
  const params = useSearchParams();
  const { bandId, can } = useSession();
  const songs = useSongs(bandId);
  const [query, setQuery] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [status, setStatus] = useState<SongStatus | "all">((params.get("status") as SongStatus | null) ?? "all");
  const [sort, setSort] = useState<Sort>("updated");
  const tab = params.get("tab") === "albums" ? "albums" : "songs";
  const createOpen = params.get("new") === "1";

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const search = next.toString();
    router.replace(`/app/songs${search ? `?${search}` : ""}`, { scroll: false });
  };

  const counts = useMemo(() => {
    const result: Record<string, number> = { all: 0 };
    for (const song of songs.data?.songs ?? []) {
      result.all += 1;
      result[song.workflowStatus] = (result[song.workflowStatus] ?? 0) + 1;
    }
    return result;
  }, [songs.data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (songs.data?.songs ?? []).filter((song) => {
      if (status === "all" ? song.workflowStatus === "archived" : song.workflowStatus !== status) return false;
      return !q || `${song.title} ${song.album?.title ?? ""} ${song.keySignature ?? ""}`.toLowerCase().includes(q);
    });
    return [...list].sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title, "de");
      if (sort === "tempo") return (Number(a.tempoBpm) || 999) - (Number(b.tempoBpm) || 999);
      if (sort === "status") return SONG_STATUS_ORDER.indexOf(a.workflowStatus) - SONG_STATUS_ORDER.indexOf(b.workflowStatus);
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [query, songs.data, sort, status]);

  return (
    <>
      <PageHeader
        title="Songs"
        description={songs.data ? `${counts.all} Songs im Repertoire` : " "}
        actions={can("songs.create") ? (
          <div className="flex gap-2">
            <Button icon={<Upload />} onClick={() => setImportOpen(true)}>Import</Button>
            <Button variant="primary" icon={<Plus />} onClick={() => setParam("new", "1")}>Neuer Song</Button>
          </div>
        ) : null}
      />

      <Tabs
        className="mb-5"
        value={tab}
        onChange={(value) => setParam("tab", value === "albums" ? "albums" : null)}
        items={[{ value: "songs", label: "Songs" }, { value: "albums", label: "Alben" }]}
      />

      {tab === "albums" ? <AlbumsGrid /> : (
        <>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
              <Input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Titel, Album oder Tonart suchen"
                className="pl-9"
                aria-label="Songs durchsuchen"
              />
            </div>
            <Select value={sort} onChange={(event) => setSort(event.target.value as Sort)} className="sm:w-48" aria-label="Sortierung">
              <option value="updated">Zuletzt geändert</option>
              <option value="title">Titel A–Z</option>
              <option value="tempo">Tempo</option>
              <option value="status">Status</option>
            </Select>
          </div>

          <div className="scrollbar-none -mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            {(["all", "draft", "review", "approved", "archived"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setStatus(value)}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors",
                  status === value ? "border-fg bg-fg text-bg" : "border-border text-muted hover:border-border-strong hover:text-fg",
                )}
              >
                {value === "all" ? "Aktiv" : SONG_STATUS_LABEL[value]}
                <span className="ml-1.5 opacity-60">{value === "all" ? counts.all - (counts.archived ?? 0) : counts[value] ?? 0}</span>
              </button>
            ))}
          </div>

          {songs.isLoading ? <SkeletonList /> : filtered.length === 0 ? (
            <EmptyState
              icon={<Music2 />}
              title={counts.all === 0 ? "Noch keine Songs" : "Keine Treffer"}
              description={counts.all === 0
                ? "Leg den ersten Song an – mit Akkorden, Aufnahmen, Noten und Diskussionen."
                : "Passe Suche oder Filter an."}
              action={counts.all === 0 && can("songs.create") ? (
                <Button variant="primary" icon={<Plus />} onClick={() => setParam("new", "1")}>Ersten Song anlegen</Button>
              ) : null}
            />
          ) : (
            <ul className="card stagger divide-y divide-border overflow-hidden">
              {filtered.map((song) => <SongRow key={song.id} song={song} />)}
            </ul>
          )}
        </>
      )}

      <CreateSongDialog open={createOpen} onClose={() => setParam("new", null)} />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </>
  );
}
