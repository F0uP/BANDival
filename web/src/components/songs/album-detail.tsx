"use client";

/* eslint-disable @next/next/no-img-element -- album covers are served by the authenticated uploads route */
import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Disc3, GripVertical, ImageUp, MoreHorizontal, Pencil, Plus, Trash2, X } from "lucide-react";
import { api, errorMessage, uploadWithProgress } from "@/lib/client/api";
import { formatDuration, formatTotalDuration } from "@/lib/client/format";
import { useAlbum, useSongs } from "@/lib/client/hooks";
import { useRevalidate } from "@/lib/client/mutations";
import type { AlbumSong } from "@/lib/client/types";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState, Skeleton } from "@/components/ui/display";
import { Input } from "@/components/ui/form";
import { Menu } from "@/components/ui/navigation";
import { SortableList } from "@/components/ui/sortable-list";
import { useConfirm, useToast } from "@/components/ui/feedback";
import { useSession } from "@/components/providers/session";

export function AlbumDetailView({ albumId }: { albumId: string }) {
  const router = useRouter();
  const { bandId } = useSession();
  const { data, error, isLoading, mutate } = useAlbum(albumId);
  const songs = useSongs(bandId);
  const confirm = useConfirm();
  const toast = useToast();
  const revalidate = useRevalidate();
  const coverInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");

  const album = data?.album;

  const saveTracks = async (tracks: AlbumSong[]) => {
    if (!album) return;
    await mutate({ album: { ...album, songs: tracks } }, { revalidate: false });
    try {
      const result = await api.patch<{ album: typeof album }>(`/api/albums/${albumId}/tracks`, { orderedSongIds: tracks.map((song) => song.id) });
      await mutate({ album: result.album }, { revalidate: false });
      void revalidate("/api/songs", "/api/albums?");
    } catch (err) {
      toast.error(errorMessage(err));
      void mutate();
    }
  };

  if (error) {
    return <EmptyState icon={<Disc3 />} title="Album nicht gefunden" action={<Button onClick={() => router.push("/app/songs?tab=albums")}>Zurück</Button>} />;
  }
  if (isLoading || !album) {
    return <div className="space-y-4"><Skeleton className="h-40 w-40" /><Skeleton className="h-48" /></div>;
  }

  const total = album.songs.reduce((sum, song) => sum + (song.durationSeconds ?? 0), 0);
  const candidates = (songs.data?.songs ?? [])
    .filter((song) => !album.songs.some((track) => track.id === song.id))
    .filter((song) => !pickerQuery.trim() || song.title.toLowerCase().includes(pickerQuery.trim().toLowerCase()));

  const rename = async () => {
    const title = await confirm({ title: "Album umbenennen", confirmLabel: "Speichern", input: { defaultValue: album.title } });
    if (typeof title !== "string" || !title.trim()) return;
    try {
      await api.patch(`/api/albums/${albumId}`, { title: title.trim() });
      await mutate();
      void revalidate("/api/albums?");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const remove = async () => {
    const ok = await confirm({ title: `Album „${album.title}“ löschen?`, description: "Die Songs bleiben erhalten.", confirmLabel: "Löschen", tone: "danger" });
    if (!ok) return;
    try {
      await api.delete(`/api/albums/${albumId}`);
      await revalidate("/api/albums", "/api/songs");
      router.push("/app/songs?tab=albums");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const uploadCover = async (file: File) => {
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      await uploadWithProgress(`/api/albums/${albumId}/cover`, formData, () => undefined).promise;
      await mutate();
      void revalidate("/api/albums?");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <Link href="/app/songs?tab=albums" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4" /> Alben
      </Link>

      <header className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end">
        <button
          type="button"
          onClick={() => coverInput.current?.click()}
          className="group relative size-40 shrink-0 overflow-hidden rounded-2xl border border-border bg-surface-2 sm:size-48"
          aria-label="Cover ändern"
        >
          {album.coverUrl ? <img src={album.coverUrl} alt="" className="size-full object-cover" /> : <Disc3 className="m-auto size-12 text-subtle" />}
          <span className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 text-sm font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
            <ImageUp className="size-4" /> {uploading ? "Lädt …" : "Cover ändern"}
          </span>
        </button>
        <input ref={coverInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void uploadCover(file);
          event.target.value = "";
        }} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Album</p>
          <h1 className="mt-1 truncate text-3xl font-semibold tracking-tight">{album.title}</h1>
          <p className="mt-1 text-sm text-muted">{album.songs.length} Songs · {formatTotalDuration(total)}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="primary" icon={<Plus />} onClick={() => setPickerOpen(true)}>Songs hinzufügen</Button>
          <Menu
            trigger={({ toggle }) => <Button size="icon" onClick={toggle} aria-label="Weitere Aktionen"><MoreHorizontal /></Button>}
            items={[
              { label: "Umbenennen", icon: <Pencil />, onSelect: () => void rename() },
              { type: "separator" },
              { label: "Album löschen", icon: <Trash2 />, danger: true, onSelect: () => void remove() },
            ]}
          />
        </div>
      </header>

      {album.songs.length === 0 ? (
        <EmptyState icon={<Disc3 />} title="Noch keine Tracks" description="Füge Songs hinzu und bring sie per Drag & Drop in die richtige Reihenfolge." />
      ) : (
        <SortableList
          id={`album-${album.id}`}
          items={album.songs}
          getId={(song) => song.id}
          onReorder={(next) => void saveTracks(next)}
          className="card divide-y divide-border overflow-hidden"
          renderItem={(song, index, handle) => (
            <div className="flex items-center gap-3 bg-surface px-3 py-2.5">
              <span {...handle} className="cursor-grab text-subtle active:cursor-grabbing" aria-label="Verschieben"><GripVertical className="size-4" /></span>
              <span className="w-6 text-right text-sm tabular-nums text-muted">{index + 1}</span>
              <Link href={`/app/songs/${song.id}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">{song.title}</Link>
              <span className="text-xs tabular-nums text-muted">{formatDuration(song.durationSeconds)}</span>
              <button
                type="button"
                onClick={() => void saveTracks(album.songs.filter((track) => track.id !== song.id))}
                className="rounded-md p-1 text-subtle hover:bg-surface-2 hover:text-fg"
                aria-label={`${song.title} aus dem Album entfernen`}
              >
                <X className="size-4" />
              </button>
            </div>
          )}
        />
      )}

      <Dialog open={pickerOpen} onClose={() => setPickerOpen(false)} title="Songs hinzufügen" size="md">
        <Input value={pickerQuery} onChange={(event) => setPickerQuery(event.target.value)} placeholder="Suchen …" className="mb-3" autoFocus />
        <ul className="max-h-[50dvh] space-y-1 overflow-y-auto">
          {candidates.length === 0 ? <li className="py-6 text-center text-sm text-muted">Keine weiteren Songs.</li> : null}
          {candidates.map((song) => (
            <li key={song.id}>
              <button
                type="button"
                onClick={() => {
                  void saveTracks([...album.songs, { id: song.id, title: song.title, albumTrackNo: null, durationSeconds: song.durationSeconds, keySignature: song.keySignature, tempoBpm: song.tempoBpm, workflowStatus: song.workflowStatus }]);
                }}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2"
              >
                <span className="truncate">{song.title}</span>
                {song.album ? <span className="truncate text-xs text-muted">aktuell: {song.album.title}</span> : <Plus className="size-4 text-muted" />}
              </button>
            </li>
          ))}
        </ul>
      </Dialog>
    </div>
  );
}
