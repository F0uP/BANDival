"use client";

import type { KeyboardEvent } from "react";

import { SongBoardPanel } from "@/components/song-board-panel";
import { SongDiscussionPanel } from "@/components/song-discussion-panel";
import { SongEditorPanel } from "@/components/song-editor-panel";
import { SongFilesPanel } from "@/components/song-files-panel";
import { SongOverviewChordsPanel } from "@/components/song-overview-chords-panel";
import {
  SongWorkspaceActions,
  SongWorkspaceUiState,
} from "@/components/song-workspace-types";

export function SongWorkspace(props: {
  ui: SongWorkspaceUiState;
  actions: SongWorkspaceActions;
}) {
  const {
    showSongsWorkspace,
    selectedSong,
    songTab,
    songWorkflowStatus,
    songSettingsAlbumId,
    albums,
    bpmTapValue,
    songSettingsSpotifyUrl,
    editSongSpotifyValidation,
    isAudioDropActive,
    isEditMode,
    isUploadingAudio,
    audioUploadProgress,
    currentAudioUploadName,
    audioUploadQueue,
    pendingAttachmentKind,
    isAttachmentDropActive,
    isUploadingAttachment,
    attachmentUploadProgress,
    currentAttachmentUploadName,
    attachmentUploadQueue,
    lastUploadSuccess,
    musicXmlDraft,
    selectedSongSpotifyEmbedUrl,
    availableInstrumentTabs,
    selectedInstrumentTab,
    newSongBoardTaskTitle,
    songBoardColumns,
    threadTitle,
    threadBody,
  } = props.ui;

  const {
    setSongTab,
    setShowLeadSheetStudio,
    updateSong,
    setSongSettingsAlbumId,
    setBpmTapValue,
    tapBpm,
    setSongSettingsSpotifyUrl,
    setSongWorkflowStatus,
    deleteSong,
    enqueueAudioFiles,
    setIsAudioDropActive,
    cancelCurrentAudioUpload,
    estimateUploadSeconds,
    formatBytes,
    retryAudioQueueItem,
    removeAudioQueueItem,
    setCurrentAudio,
    enqueueAttachmentFiles,
    setPendingAttachmentKind,
    setIsAttachmentDropActive,
    cancelCurrentAttachmentUpload,
    retryAttachmentQueueItem,
    removeAttachmentQueueItem,
    renameAudioQuick,
    renameAttachmentQuick,
    markAudioCurrentQuick,
    postUploadToDiscussion,
    setMusicXmlDraft,
    saveMusicXmlDraft,
    setSelectedInstrumentTab,
    setNewSongBoardTaskTitle,
    addSongBoardTask,
    moveSongBoardTask,
    deleteSongBoardTask,
    setThreadTitle,
    setThreadBody,
    createThread,
    addPost,
  } = props.actions;

  if (!showSongsWorkspace || !selectedSong) {
    return null;
  }

  const tabOrder = ["overview", "edit", "files", "chords", "discussion"] as const;
  const tabLabels: Record<(typeof tabOrder)[number], string> = {
    overview: "Overview",
    edit: "Quick Edit",
    files: "Files",
    chords: "Chords",
    discussion: "Discussion",
  };

  const handleSongTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentTab: (typeof tabOrder)[number]) => {
    const idx = tabOrder.indexOf(currentTab);
    if (idx < 0) {
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      setSongTab(tabOrder[(idx + 1) % tabOrder.length]);
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setSongTab(tabOrder[(idx - 1 + tabOrder.length) % tabOrder.length]);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      setSongTab(tabOrder[0]);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      setSongTab(tabOrder[tabOrder.length - 1]);
    }
  };

  return (
    <section className="song-workspace-stack">
      <div className="song-tabs" role="tablist" aria-label="Song workspace tabs">
        {tabOrder.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            id={`song-tab-${tab}`}
            aria-selected={songTab === tab}
            aria-controls={`song-panel-${tab}`}
            tabIndex={songTab === tab ? 0 : -1}
            className={songTab === tab ? "active" : ""}
            onClick={() => setSongTab(tab)}
            onKeyDown={(event) => handleSongTabKeyDown(event, tab)}
          >
            {tabLabels[tab]}
          </button>
        ))}
        <button type="button" className="ghost" onClick={() => setShowLeadSheetStudio(true)}>Lead Sheet Studio</button>
      </div>

      <section className="box-grid">
        {songTab === "edit" ? (
          <section role="tabpanel" id="song-panel-edit" aria-labelledby="song-tab-edit">
            <SongEditorPanel
              selectedSong={selectedSong}
              songWorkflowStatus={songWorkflowStatus}
              setShowLeadSheetStudio={setShowLeadSheetStudio}
              updateSong={updateSong}
              songSettingsAlbumId={songSettingsAlbumId}
              setSongSettingsAlbumId={setSongSettingsAlbumId}
              albums={albums}
              bpmTapValue={bpmTapValue}
              setBpmTapValue={setBpmTapValue}
              tapBpm={tapBpm}
              songSettingsSpotifyUrl={songSettingsSpotifyUrl}
              setSongSettingsSpotifyUrl={setSongSettingsSpotifyUrl}
              editSongSpotifyValidation={editSongSpotifyValidation}
              setSongWorkflowStatus={setSongWorkflowStatus}
              deleteSong={deleteSong}
            />
          </section>
        ) : null}

        {songTab === "files" ? (
          <section role="tabpanel" id="song-panel-files" aria-labelledby="song-tab-files">
            <SongFilesPanel
              selectedSong={selectedSong}
              enqueueAudioFiles={enqueueAudioFiles}
              isAudioDropActive={isAudioDropActive}
              setIsAudioDropActive={setIsAudioDropActive}
              isEditMode={isEditMode}
              isUploadingAudio={isUploadingAudio}
              audioUploadProgress={audioUploadProgress}
              currentAudioUploadName={currentAudioUploadName}
              cancelCurrentAudioUpload={cancelCurrentAudioUpload}
              audioUploadQueue={audioUploadQueue}
              estimateUploadSeconds={estimateUploadSeconds}
              formatBytes={formatBytes}
              retryAudioQueueItem={retryAudioQueueItem}
              removeAudioQueueItem={removeAudioQueueItem}
              setCurrentAudio={setCurrentAudio}
              enqueueAttachmentFiles={enqueueAttachmentFiles}
              pendingAttachmentKind={pendingAttachmentKind}
              setPendingAttachmentKind={setPendingAttachmentKind}
              isAttachmentDropActive={isAttachmentDropActive}
              setIsAttachmentDropActive={setIsAttachmentDropActive}
              isUploadingAttachment={isUploadingAttachment}
              attachmentUploadProgress={attachmentUploadProgress}
              currentAttachmentUploadName={currentAttachmentUploadName}
              cancelCurrentAttachmentUpload={cancelCurrentAttachmentUpload}
              attachmentUploadQueue={attachmentUploadQueue}
              retryAttachmentQueueItem={retryAttachmentQueueItem}
              removeAttachmentQueueItem={removeAttachmentQueueItem}
              lastUploadSuccess={lastUploadSuccess}
              renameAudioQuick={renameAudioQuick}
              renameAttachmentQuick={renameAttachmentQuick}
              markAudioCurrentQuick={markAudioCurrentQuick}
              postUploadToDiscussion={postUploadToDiscussion}
              musicXmlDraft={musicXmlDraft}
              setMusicXmlDraft={setMusicXmlDraft}
              saveMusicXmlDraft={saveMusicXmlDraft}
            />
          </section>
        ) : null}

        {songTab === "overview" || songTab === "chords" ? (
          <section role="tabpanel" id={`song-panel-${songTab}`} aria-labelledby={`song-tab-${songTab}`}>
            <SongOverviewChordsPanel
              selectedSong={selectedSong}
              songTab={songTab}
              selectedSongSpotifyEmbedUrl={selectedSongSpotifyEmbedUrl}
              availableInstrumentTabs={availableInstrumentTabs}
              selectedInstrumentTab={selectedInstrumentTab}
              setSelectedInstrumentTab={setSelectedInstrumentTab}
            />
          </section>
        ) : null}
      </section>

      <SongBoardPanel
        newSongBoardTaskTitle={newSongBoardTaskTitle}
        setNewSongBoardTaskTitle={setNewSongBoardTaskTitle}
        addSongBoardTask={addSongBoardTask}
        songBoardColumns={songBoardColumns}
        moveSongBoardTask={moveSongBoardTask}
        deleteSongBoardTask={deleteSongBoardTask}
      />

      {songTab === "discussion" ? (
        <section role="tabpanel" id="song-panel-discussion" aria-labelledby="song-tab-discussion">
          <SongDiscussionPanel
            selectedSong={selectedSong}
            threadTitle={threadTitle}
            setThreadTitle={setThreadTitle}
            threadBody={threadBody}
            setThreadBody={setThreadBody}
            createThread={createThread}
            addPost={addPost}
          />
        </section>
      ) : null}
    </section>
  );
}
