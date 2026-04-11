"use client";

import { SheetRender } from "@/components/song-detail-widgets";
import { Song, UploadQueueItem, UploadSuccessCard } from "@/components/song-workspace-types";

export function SongFilesPanel(props: {
  selectedSong: Song;
  enqueueAudioFiles: (files: File[]) => void;
  isAudioDropActive: boolean;
  setIsAudioDropActive: (value: boolean) => void;
  isEditMode: boolean;
  isUploadingAudio: boolean;
  audioUploadProgress: number | null;
  currentAudioUploadName: string;
  cancelCurrentAudioUpload: () => void;
  audioUploadQueue: UploadQueueItem[];
  estimateUploadSeconds: (bytes: number) => number;
  formatBytes: (bytes: number) => string;
  retryAudioQueueItem: (itemId: string) => void;
  removeAudioQueueItem: (itemId: string) => void;
  setCurrentAudio: (value: { url: string; name: string; durationSeconds?: number | null } | null) => void;
  enqueueAttachmentFiles: (files: File[], kind: string) => void;
  pendingAttachmentKind: string;
  setPendingAttachmentKind: (value: string) => void;
  isAttachmentDropActive: boolean;
  setIsAttachmentDropActive: (value: boolean) => void;
  isUploadingAttachment: boolean;
  attachmentUploadProgress: number | null;
  currentAttachmentUploadName: string;
  cancelCurrentAttachmentUpload: () => void;
  attachmentUploadQueue: UploadQueueItem[];
  retryAttachmentQueueItem: (itemId: string) => void;
  removeAttachmentQueueItem: (itemId: string) => void;
  lastUploadSuccess: UploadSuccessCard | null;
  renameAudioQuick: (audioId: string, nextName: string) => Promise<void>;
  renameAttachmentQuick: (attachmentId: string, nextName: string) => Promise<void>;
  markAudioCurrentQuick: (audioId: string) => Promise<void>;
  postUploadToDiscussion: (upload: UploadSuccessCard) => Promise<void>;
  musicXmlDraft: string;
  setMusicXmlDraft: (value: string) => void;
  saveMusicXmlDraft: () => Promise<void>;
}) {
  const {
    selectedSong,
    enqueueAudioFiles,
    isAudioDropActive,
    setIsAudioDropActive,
    isEditMode,
    isUploadingAudio,
    audioUploadProgress,
    currentAudioUploadName,
    cancelCurrentAudioUpload,
    audioUploadQueue,
    estimateUploadSeconds,
    formatBytes,
    retryAudioQueueItem,
    removeAudioQueueItem,
    setCurrentAudio,
    enqueueAttachmentFiles,
    pendingAttachmentKind,
    setPendingAttachmentKind,
    isAttachmentDropActive,
    setIsAttachmentDropActive,
    isUploadingAttachment,
    attachmentUploadProgress,
    currentAttachmentUploadName,
    cancelCurrentAttachmentUpload,
    attachmentUploadQueue,
    retryAttachmentQueueItem,
    removeAttachmentQueueItem,
    lastUploadSuccess,
    renameAudioQuick,
    renameAttachmentQuick,
    markAudioCurrentQuick,
    postUploadToDiscussion,
    musicXmlDraft,
    setMusicXmlDraft,
    saveMusicXmlDraft,
  } = props;

  return (
    <>
      <article className="box">
        <h3>Audio Versionen</h3>
        <form
          className="inline-upload"
          onSubmit={(event) => {
            event.preventDefault();
            const input = event.currentTarget.elements.namedItem("file") as HTMLInputElement | null;
            const files = input?.files ? Array.from(input.files) : [];
            if (files.length > 0) {
              enqueueAudioFiles(files);
            }
            event.currentTarget.reset();
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setIsAudioDropActive(true);
          }}
          onDragLeave={() => setIsAudioDropActive(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsAudioDropActive(false);
            const files = Array.from(event.dataTransfer.files ?? []);
            if (files.length > 0) {
              enqueueAudioFiles(files);
            }
          }}
        >
          <input name="file" type="file" accept="audio/*" multiple />
          <button type="submit" disabled={!isEditMode || isUploadingAudio}>
            {isUploadingAudio ? "Audio wird hochgeladen..." : "Zur Upload-Queue"}
          </button>
        </form>
        <div className={`dropzone ${isAudioDropActive ? "is-active" : ""}`}>
          Audio-Dateien hier hineinziehen oder ueber Dateiauswahl zur Queue hinzufuegen.
        </div>
        {audioUploadProgress !== null ? (
          <div className="upload-progress" role="status" aria-live="polite">
            <small>{currentAudioUploadName || "Audio Upload"}</small>
            <div className="upload-progress-track">
              <div className="upload-progress-fill" style={{ width: `${audioUploadProgress}%` }} />
            </div>
            <span>{audioUploadProgress}%</span>
          </div>
        ) : null}
        {isUploadingAudio ? <button type="button" className="ghost" onClick={cancelCurrentAudioUpload}>Aktuellen Upload abbrechen</button> : null}
        {audioUploadQueue.length > 0 ? (
          <ul className="upload-queue">
            {audioUploadQueue.map((item) => {
              const estimatedSec = estimateUploadSeconds(item.file.size);
              return (
                <li key={item.id} className={`upload-queue-item status-${item.status}`}>
                  <strong>{item.file.name}</strong>
                  <span>{formatBytes(item.file.size)} | ca. {estimatedSec}s</span>
                  <span>{item.error ?? item.status}</span>
                  <div className="upload-progress-track compact">
                    <div className="upload-progress-fill" style={{ width: `${item.progress}%` }} />
                  </div>
                  <div className="upload-queue-actions">
                    {(item.status === "error" || item.status === "canceled") ? (
                      <button type="button" className="ghost" onClick={() => retryAudioQueueItem(item.id)}>
                        Erneut versuchen
                      </button>
                    ) : null}
                    {(item.status === "done" || item.status === "error" || item.status === "canceled") ? (
                      <button type="button" className="ghost" onClick={() => removeAudioQueueItem(item.id)}>
                        Entfernen
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
        <div className="audio-list">
          {selectedSong.audioVersions.map((audio) => (
            <div key={audio.id} className={audio.isCurrent ? "audio-card current" : "audio-card"}>
              <div>
                <strong>{audio.fileName}</strong>
                <p>Version {audio.versionNumber} • {new Date(audio.uploadedAt).toLocaleDateString("de-DE")}</p>
                {audio.isCurrent ? <span className="pill">Neueste</span> : null}
              </div>
              <div className="audio-card-actions">
                <button
                  type="button"
                  className="ghost"
                  onClick={() =>
                    setCurrentAudio({
                      url: audio.fileUrl,
                      name: `${selectedSong.title} - ${audio.fileName}`,
                      durationSeconds: selectedSong.durationSeconds,
                    })
                  }
                >
                  Im Hauptplayer abspielen
                </button>
                <a className="ghost-link" href={audio.fileUrl} target="_blank" rel="noreferrer">
                  Datei oeffnen
                </a>
              </div>
            </div>
          ))}
        </div>
      </article>

      <article className="box">
        <h3>Dateien, Notenblaetter, Leadsheets</h3>
        <form
          className="inline-upload"
          onSubmit={(event) => {
            event.preventDefault();
            const input = event.currentTarget.elements.namedItem("file") as HTMLInputElement | null;
            const files = input?.files ? Array.from(input.files) : [];
            if (files.length > 0) {
              enqueueAttachmentFiles(files, pendingAttachmentKind);
            }
            event.currentTarget.reset();
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setIsAttachmentDropActive(true);
          }}
          onDragLeave={() => setIsAttachmentDropActive(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsAttachmentDropActive(false);
            const files = Array.from(event.dataTransfer.files ?? []);
            if (files.length > 0) {
              enqueueAttachmentFiles(files, pendingAttachmentKind);
            }
          }}
        >
          <select name="kind" value={pendingAttachmentKind} onChange={(event) => setPendingAttachmentKind(event.target.value)}>
            <option value="other">Datei</option>
            <option value="lead_sheet">Leadsheet</option>
            <option value="score_pdf">Score PDF</option>
            <option value="score_musicxml">MusicXML</option>
            <option value="score_image">Score Bild</option>
            <option value="lyrics_doc">Lyrics Datei</option>
          </select>
          <input name="file" type="file" multiple />
          <button type="submit" disabled={!isEditMode || isUploadingAttachment}>
            {isUploadingAttachment ? "Datei wird hochgeladen..." : "Zur Upload-Queue"}
          </button>
        </form>
        <div className={`dropzone ${isAttachmentDropActive ? "is-active" : ""}`}>
          Dateien hier hineinziehen oder ueber Dateiauswahl zur Queue hinzufuegen.
        </div>
        {attachmentUploadProgress !== null ? (
          <div className="upload-progress" role="status" aria-live="polite">
            <small>{currentAttachmentUploadName || "Datei Upload"}</small>
            <div className="upload-progress-track">
              <div className="upload-progress-fill" style={{ width: `${attachmentUploadProgress}%` }} />
            </div>
            <span>{attachmentUploadProgress}%</span>
          </div>
        ) : null}
        {isUploadingAttachment ? <button type="button" className="ghost" onClick={cancelCurrentAttachmentUpload}>Aktuellen Upload abbrechen</button> : null}
        {attachmentUploadQueue.length > 0 ? (
          <ul className="upload-queue">
            {attachmentUploadQueue.map((item) => {
              const estimatedSec = estimateUploadSeconds(item.file.size);
              return (
                <li key={item.id} className={`upload-queue-item status-${item.status}`}>
                  <strong>{item.file.name}</strong>
                  <span>{formatBytes(item.file.size)} | ca. {estimatedSec}s | Typ: {item.kind ?? "other"}</span>
                  <span>{item.error ?? item.status}</span>
                  <div className="upload-progress-track compact">
                    <div className="upload-progress-fill" style={{ width: `${item.progress}%` }} />
                  </div>
                  <div className="upload-queue-actions">
                    {(item.status === "error" || item.status === "canceled") ? (
                      <button type="button" className="ghost" onClick={() => retryAttachmentQueueItem(item.id)}>
                        Erneut versuchen
                      </button>
                    ) : null}
                    {(item.status === "done" || item.status === "error" || item.status === "canceled") ? (
                      <button type="button" className="ghost" onClick={() => removeAttachmentQueueItem(item.id)}>
                        Entfernen
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}

        {lastUploadSuccess ? (
          <div className="upload-success-card">
            <strong>Upload erfolgreich: {lastUploadSuccess.fileName}</strong>
            <span>{lastUploadSuccess.kindLabel}</span>
            <div className="inline-tools">
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  const next = window.prompt("Neuer Dateiname", lastUploadSuccess.fileName);
                  if (!next?.trim()) {
                    return;
                  }
                  void (lastUploadSuccess.isAudio
                    ? renameAudioQuick(lastUploadSuccess.id, next.trim())
                    : renameAttachmentQuick(lastUploadSuccess.id, next.trim()));
                }}
              >
                Umbenennen
              </button>
              {lastUploadSuccess.isAudio ? (
                <button type="button" className="ghost" onClick={() => void markAudioCurrentQuick(lastUploadSuccess.id)}>
                  Als aktuell markieren
                </button>
              ) : null}
              <button type="button" className="ghost" onClick={() => void postUploadToDiscussion(lastUploadSuccess)}>
                In Diskussion posten
              </button>
            </div>
          </div>
        ) : null}

        <div className="inline-sheet-editor">
          <textarea
            rows={6}
            placeholder="MusicXML hier einfuegen"
            value={musicXmlDraft}
            onChange={(event) => setMusicXmlDraft(event.target.value)}
            disabled={!isEditMode}
          />
          <button type="button" onClick={() => void saveMusicXmlDraft()} disabled={!isEditMode}>
            MusicXML als Notenblatt speichern
          </button>
        </div>

        <ul className="attachment-list">
          {selectedSong.attachments.map((file) => (
            <li key={file.id}>
              <a href={file.fileUrl} target="_blank" rel="noreferrer">
                {file.fileName}
              </a>
              <span>{file.kind}</span>
            </li>
          ))}
        </ul>
      </article>

      <article className="box">
        <h3>Notenblatt Render</h3>
        <SheetRender
          musicXmlUrl={
            selectedSong.attachments.find((att) => att.kind === "score_musicxml")?.fileUrl ?? null
          }
        />
      </article>
    </>
  );
}
