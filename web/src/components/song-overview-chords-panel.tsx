"use client";

import type { KeyboardEvent } from "react";

import { ChordRender } from "@/components/song-detail-widgets";
import { Song, SongTab } from "@/components/song-workspace-types";

export function SongOverviewChordsPanel(props: {
  selectedSong: Song;
  songTab: SongTab;
  selectedSongSpotifyEmbedUrl: string | null;
  availableInstrumentTabs: string[];
  selectedInstrumentTab: string;
  setSelectedInstrumentTab: (value: string) => void;
}) {
  const {
    selectedSong,
    songTab,
    selectedSongSpotifyEmbedUrl,
    availableInstrumentTabs,
    selectedInstrumentTab,
    setSelectedInstrumentTab,
  } = props;

  const normalizedInstruments = availableInstrumentTabs.length > 0 ? availableInstrumentTabs : ["General"];
  const activeInstrument = normalizedInstruments.includes(selectedInstrumentTab) ? selectedInstrumentTab : normalizedInstruments[0];

  const instrumentId = (instrument: string) =>
    instrument.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "instrument";

  const handleInstrumentTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentInstrument: string) => {
    const idx = normalizedInstruments.indexOf(currentInstrument);
    if (idx < 0) {
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      setSelectedInstrumentTab(normalizedInstruments[(idx + 1) % normalizedInstruments.length]);
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setSelectedInstrumentTab(normalizedInstruments[(idx - 1 + normalizedInstruments.length) % normalizedInstruments.length]);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      setSelectedInstrumentTab(normalizedInstruments[0]);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      setSelectedInstrumentTab(normalizedInstruments[normalizedInstruments.length - 1]);
    }
  };

  return (
    <>
      {songTab === "overview" ? <article className="box">
        <h3>Song Overview</h3>
        <ul className="attachment-list" style={{ marginBottom: "0.6rem" }}>
          <li><strong>Titel</strong><span>{selectedSong.title}</span></li>
          <li><strong>Album</strong><span>{selectedSong.album?.title ?? "-"}</span></li>
          <li><strong>Track #</strong><span>{selectedSong.albumTrackNo ?? "-"}</span></li>
          <li><strong>Workflow</strong><span>{selectedSong.workflowStatus ?? "draft"}</span></li>
          <li><strong>Tonart</strong><span>{selectedSong.keySignature ?? "-"}</span></li>
          <li><strong>BPM</strong><span>{selectedSong.tempoBpm ?? "-"}</span></li>
          <li><strong>Dauer</strong><span>{selectedSong.durationSeconds ? `${Math.floor(selectedSong.durationSeconds / 60)}:${String(selectedSong.durationSeconds % 60).padStart(2, "0")}` : "-"}</span></li>
          <li><strong>Zuletzt geaendert</strong><span>{new Date(selectedSong.updatedAt).toLocaleString("de-DE")}</span></li>
          <li><strong>Audio-Versionen</strong><span>{selectedSong.audioVersions.length}</span></li>
          <li><strong>Anhaenge</strong><span>{selectedSong.attachments.length}</span></li>
        </ul>
        <h4>Spotify</h4>
        {selectedSong.spotifyUrl ? (
          <>
            <a href={selectedSong.spotifyUrl} target="_blank" rel="noreferrer">Song auf Spotify oeffnen</a>
            {selectedSongSpotifyEmbedUrl ? (
              <iframe
                src={selectedSongSpotifyEmbedUrl}
                title={`spotify-${selectedSong.id}`}
                width="100%"
                height="152"
                style={{ border: 0, borderRadius: "12px", marginTop: "0.55rem" }}
                allow="encrypted-media"
                loading="lazy"
              />
            ) : (
              <p>Spotify-Link erkannt, aber nicht als Embed darstellbar. Bitte Track-/Album-/Playlist-Link verwenden.</p>
            )}
          </>
        ) : (
          <p>Noch kein Spotify Link eingetragen.</p>
        )}
      </article> : null}

      {songTab === "chords" ? <article className="box">
        <h3>Akkorde Render</h3>
        <div className="instrument-tabs" role="tablist" aria-label="Instrument Tabs">
          {normalizedInstruments.map((instrument) => (
            <button
              key={instrument}
              type="button"
              role="tab"
              id={`instrument-tab-${selectedSong.id}-${instrumentId(instrument)}`}
              aria-controls={`instrument-panel-${selectedSong.id}`}
              aria-selected={activeInstrument === instrument}
              tabIndex={activeInstrument === instrument ? 0 : -1}
              className={activeInstrument === instrument ? "active" : ""}
              onClick={() => setSelectedInstrumentTab(instrument)}
              onKeyDown={(event) => handleInstrumentTabKeyDown(event, instrument)}
            >
              {instrument}
            </button>
          ))}
        </div>
        <section
          id={`instrument-panel-${selectedSong.id}`}
          role="tabpanel"
          aria-labelledby={`instrument-tab-${selectedSong.id}-${instrumentId(activeInstrument)}`}
        >
          <ChordRender
            chordProText={selectedSong.chordProText ?? ""}
            instrumentLabel={activeInstrument}
            lyricsText={selectedSong.lyricsRevisions[0]?.lyricsMarkdown ?? ""}
          />
        </section>
      </article> : null}
    </>
  );
}
