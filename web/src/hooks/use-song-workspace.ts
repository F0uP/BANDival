import { useMemo } from "react";

type SongLike = {
  id: string;
  title: string;
  notes: string | null;
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
      return `${song.title} ${albumTitle} ${song.notes ?? ""}`.toLowerCase().includes(q);
    });
  }, [songs, searchQuery]);

  return {
    selectedSong,
    filteredSongs,
  };
}
