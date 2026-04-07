import { useMemo } from "react";

type SongLike = {
  id: string;
  title: string;
  notes: string | null;
  chordProText?: string | null;
  lyricsRevisions?: Array<{ lyricsMarkdown: string }>;
  attachments?: Array<{ fileName: string; kind: string }>;
  threads?: Array<{ title: string; posts?: Array<{ body: string }> }>;
  album?: { title: string } | null;
};

export function useSongWorkspace<TSong extends SongLike>(args: {
  songs: TSong[];
  selectedSongId: string | null;
  searchQuery: string;
}) {
  const { songs, selectedSongId, searchQuery } = args;

  const selectedSong = useMemo(
    () => songs.find((song) => song.id === selectedSongId) ?? null,
    [songs, selectedSongId],
  );

  const filteredSongs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return songs;
    }

    return songs.filter((song) => {
      const albumTitle = song.album?.title ?? "";
      const lyrics = (song.lyricsRevisions ?? []).map((r) => r.lyricsMarkdown).join(" ");
      const files = (song.attachments ?? []).map((a) => `${a.fileName} ${a.kind}`).join(" ");
      const threads = (song.threads ?? [])
        .map((t) => `${t.title} ${(t.posts ?? []).map((p) => p.body).join(" ")}`)
        .join(" ");
      return `${song.title} ${albumTitle} ${song.notes ?? ""} ${song.chordProText ?? ""} ${lyrics} ${files} ${threads}`
        .toLowerCase()
        .includes(q);
    });
  }, [songs, searchQuery]);

  return {
    selectedSong,
    filteredSongs,
  };
}
