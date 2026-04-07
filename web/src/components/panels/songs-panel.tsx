import { FormEvent } from "react";

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
  newSongTitle: string;
  newAlbumTitle: string;
  canCreateSongs: boolean;
  onCreateSong: (event: FormEvent) => void;
  onCreateAlbum: (event: FormEvent) => void;
  onChangeSongTitle: (value: string) => void;
  onChangeAlbumTitle: (value: string) => void;
  onSelectAlbum: (albumId: string) => void;
  onSelectSong: (songId: string) => void;
}) {
  const {
    albums,
    filteredSongs,
    selectedAlbumId,
    selectedSongId,
    newSongTitle,
    newAlbumTitle,
    canCreateSongs,
    onCreateSong,
    onCreateAlbum,
    onChangeSongTitle,
    onChangeAlbumTitle,
    onSelectAlbum,
    onSelectSong,
  } = props;

  return (
    <>
      <form className="quick-form" onSubmit={onCreateSong}>
        <input
          value={newSongTitle}
          onChange={(event) => onChangeSongTitle(event.target.value)}
          placeholder="Neuer Songtitel"
          disabled={!canCreateSongs}
        />
        <button type="submit" disabled={!canCreateSongs} title={canCreateSongs ? undefined : "Keine Berechtigung"}>
          + Song
        </button>
      </form>

      <form className="quick-form" onSubmit={onCreateAlbum}>
        <input
          value={newAlbumTitle}
          onChange={(event) => onChangeAlbumTitle(event.target.value)}
          placeholder="Neues Album"
        />
        <button type="submit">
          + Album
        </button>
      </form>

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

      <ul>
        {filteredSongs.map((song) => (
          <li key={song.id}>
            <button
              type="button"
              className={song.id === selectedSongId ? "active" : ""}
              onClick={() => onSelectSong(song.id)}
            >
              <span>{song.album?.title ? `${song.album.title} - ${song.title}` : song.title}</span>
              <small>{new Date(song.updatedAt).toLocaleDateString("de-DE")}</small>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
