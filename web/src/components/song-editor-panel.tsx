"use client";

import { FormEvent } from "react";
import { Album, Song, SongWorkflowStatus } from "@/components/song-workspace-types";

export function SongEditorPanel(props: {
  selectedSong: Song;
  songWorkflowStatus: SongWorkflowStatus;
  setShowLeadSheetStudio: (value: boolean) => void;
  updateSong: (formData: FormData) => Promise<void>;
  songSettingsAlbumId: string;
  setSongSettingsAlbumId: (value: string) => void;
  albums: Album[];
  bpmTapValue: string;
  setBpmTapValue: (value: string) => void;
  tapBpm: () => void;
  songSettingsSpotifyUrl: string;
  setSongSettingsSpotifyUrl: (value: string) => void;
  editSongSpotifyValidation: { embedUrl: string | null; message: string };
  setSongWorkflowStatus: (value: SongWorkflowStatus) => void;
  deleteSong: (songId: string) => Promise<void>;
}) {
  const {
    selectedSong,
    songWorkflowStatus,
    setShowLeadSheetStudio,
    updateSong,
    songSettingsAlbumId,
    setSongSettingsAlbumId,
    albums,
    bpmTapValue,
    setBpmTapValue,
    tapBpm,
    songSettingsSpotifyUrl,
    setSongSettingsSpotifyUrl,
    editSongSpotifyValidation,
    setSongWorkflowStatus,
    deleteSong,
  } = props;

  return (
    <article className="box">
      <div className="song-head">
        <h3>{selectedSong.title} <span className={`workflow-pill ${songWorkflowStatus}`}>{songWorkflowStatus}</span></h3>
        <button type="button" className="ghost" onClick={() => setShowLeadSheetStudio(true)}>Lead Sheet Studio</button>
      </div>
      <form
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          void updateSong(formData);
        }}
      >
        <label>
          Titel
          <input name="title" defaultValue={selectedSong.title} />
        </label>
        <label>
          Album
          <select
            name="albumId"
            value={songSettingsAlbumId}
            onChange={(event) => setSongSettingsAlbumId(event.target.value)}
          >
            <option value="">Kein Album</option>
            {albums.map((album) => (
              <option key={album.id} value={album.id}>
                {album.title}
              </option>
            ))}
          </select>
        </label>
        {songSettingsAlbumId ? (
          <label>
            Album-Tracknummer
            <input name="albumTrackNo" type="number" min={1} max={99} defaultValue={selectedSong.albumTrackNo ?? ""} className="metric-input" />
          </label>
        ) : null}
        <label>
          Tonart
          <input name="keySignature" defaultValue={selectedSong.keySignature ?? ""} />
        </label>
        <label>
          BPM
          <div className="inline-tools">
            <input name="tempoBpm" type="number" step="0.01" value={bpmTapValue} onChange={(event) => setBpmTapValue(event.target.value)} />
            <button type="button" className="ghost" onClick={tapBpm}>Tap BPM</button>
          </div>
        </label>
        <label>
          Dauer (MM:SS)
          <div className="inline-tools">
            <input name="durationMinutes" type="number" min={0} max={99} defaultValue={Math.floor((selectedSong.durationSeconds ?? 0) / 60)} placeholder="Min." aria-label="Dauer Minuten-Anteil" className="metric-input duration-field" />
            <input name="durationRestSeconds" type="number" min={0} max={59} defaultValue={(selectedSong.durationSeconds ?? 0) % 60} placeholder="Sek." aria-label="Dauer Sekunden-Anteil" className="metric-input duration-field" />
          </div>
          <small style={{ color: "var(--muted)" }}>Erstes Feld = Minuten, zweites Feld = Restsekunden (0-59).</small>
        </label>
        <label>
          Spotify URL
          <input
            name="spotifyUrl"
            value={songSettingsSpotifyUrl}
            onChange={(event) => setSongSettingsSpotifyUrl(event.target.value)}
            placeholder="https://open.spotify.com/track/..."
          />
          {editSongSpotifyValidation.message ? (
            <small style={{ color: editSongSpotifyValidation.embedUrl ? "#1e6642" : "#9f2c23" }}>
              {editSongSpotifyValidation.message}
            </small>
          ) : null}
        </label>
        <label>
          Workflow
          <select name="workflowStatus" value={songWorkflowStatus} onChange={(event) => setSongWorkflowStatus(event.target.value as SongWorkflowStatus)}>
            <option value="draft">Entwurf</option>
            <option value="review">In Review</option>
            <option value="approved">Freigegeben</option>
            <option value="archived">Archiviert</option>
          </select>
        </label>
        <label>
          Notizen
          <textarea name="notes" defaultValue={selectedSong.notes ?? ""} rows={3} />
        </label>
        <div className="upload-queue-actions">
          <button type="submit">Song speichern</button>
          <button type="button" className="ghost" onClick={() => setShowLeadSheetStudio(true)}>Lead Sheet bearbeiten</button>
          <button type="button" className="ghost" onClick={() => void deleteSong(selectedSong.id)}>Song loeschen</button>
        </div>
      </form>
    </article>
  );
}
