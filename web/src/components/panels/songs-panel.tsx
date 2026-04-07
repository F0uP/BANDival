import { ReactNode } from "react";

type Album = {
  id: string;
  title: string;
};

type Song = {
  id: string;
  title: string;
  updatedAt: string;
  album?: { title: string } | null;
};

export function SongsPanel(props: {
  albums: Album[];
  filteredSongs: Song[];
  selectedAlbumId: string | null;
  selectedSongId: string | null;
  canCreateSongs: boolean;
  searchQuery: string;
  onOpenCreateSong: () => void;
  onOpenCreateAlbum: () => void;
  onSelectAlbum: (albumId: string) => void;
  onSelectSong: (songId: string) => void;
}) {
  const {
    albums,
    filteredSongs,
    selectedAlbumId,
    selectedSongId,
    canCreateSongs,
    searchQuery,
    onOpenCreateSong,
    onOpenCreateAlbum,
    onSelectAlbum,
    onSelectSong,
  } = props;

  function highlight(text: string): ReactNode {
    const query = searchQuery.trim();
    if (!query) {
      return text;
    }

    const normalized = text.toLowerCase();
    const idx = normalized.indexOf(query.toLowerCase());
    if (idx < 0) {
      return text;
    }

    const end = idx + query.length;
    return (
      <>
        {text.slice(0, idx)}
        <mark>{text.slice(idx, end)}</mark>
        {text.slice(end)}
      </>
    );
  }

  return (
    <>
      <div className="quick-actions">
        <button type="button" onClick={onOpenCreateSong} disabled={!canCreateSongs} title={canCreateSongs ? undefined : "Keine Berechtigung"}>
          Neuer Song
        </button>
        <button type="button" className="ghost" onClick={onOpenCreateAlbum}>
          Neues Album
        </button>
      </div>

      <div className="album-chips">
        {albums.map((album) => (
          <button
            key={album.id}
            type="button"
            className={selectedAlbumId === album.id ? "album-chip active" : "album-chip"}
            onClick={() => onSelectAlbum(album.id)}
          >
            {album.title}
          </button>
        ))}
      </div>

      <ul className="stagger-in">
        {filteredSongs.map((song) => (
          <li key={song.id}>
            <button
              type="button"
              className={song.id === selectedSongId ? "active" : ""}
              onClick={() => onSelectSong(song.id)}
            >
              <span>{highlight(song.album?.title ? `${song.album.title} - ${song.title}` : song.title)}</span>
              <small>{new Date(song.updatedAt).toLocaleDateString("de-DE")}</small>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
