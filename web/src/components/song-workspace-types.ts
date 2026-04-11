import type { FormEvent } from "react";

export type SongWorkflowStatus = "draft" | "review" | "approved" | "archived";
export type SongTab = "overview" | "edit" | "files" | "chords" | "discussion";
export type BoardTaskStatus = "open" | "in_progress" | "done";

export type BoardTask = {
  id: string;
  title: string;
  status: BoardTaskStatus;
  createdAt: string;
};

export type SongAudio = {
  id: string;
  versionNumber: number;
  fileUrl: string;
  fileName: string;
  isCurrent: boolean;
  uploadedAt: string;
};

export type SongAttachment = {
  id: string;
  fileName: string;
  fileUrl: string;
  kind: string;
  createdAt: string;
};

export type DiscussionPost = {
  id: string;
  createdAt: string;
  body: string;
  createdBy?: {
    id: string;
    email: string;
    displayName: string | null;
    avatarUrl: string | null;
  } | null;
};

export type DiscussionThread = {
  id: string;
  title: string;
  createdAt?: string;
  createdBy?: {
    id: string;
    email: string;
    displayName: string | null;
    avatarUrl: string | null;
  } | null;
  posts: DiscussionPost[];
};

export type Song = {
  id: string;
  title: string;
  workflowStatus?: SongWorkflowStatus;
  albumId?: string | null;
  albumTrackNo?: number | null;
  album?: { title: string } | null;
  keySignature: string | null;
  tempoBpm: string | number | null;
  durationSeconds: number | null;
  spotifyUrl: string | null;
  notes: string | null;
  chordProText?: string | null;
  updatedAt: string;
  audioVersions: SongAudio[];
  attachments: SongAttachment[];
  lyricsRevisions: Array<{ lyricsMarkdown: string }>;
  threads: DiscussionThread[];
};

export type Album = {
  id: string;
  title: string;
};

export type UploadQueueItem = {
  id: string;
  file: File;
  progress: number;
  status: "queued" | "uploading" | "done" | "error" | "canceled";
  error?: string;
  kind?: string;
};

export type UploadSuccessCard = {
  id: string;
  fileName: string;
  fileUrl: string;
  kindLabel: string;
  isAudio: boolean;
};

export type SongWorkspaceUiState = {
  showSongsWorkspace: boolean;
  selectedSong: Song | null;
  songTab: SongTab;
  songWorkflowStatus: SongWorkflowStatus;
  songSettingsAlbumId: string;
  albums: Album[];
  bpmTapValue: string;
  songSettingsSpotifyUrl: string;
  editSongSpotifyValidation: { embedUrl: string | null; message: string };
  isAudioDropActive: boolean;
  isEditMode: boolean;
  isUploadingAudio: boolean;
  audioUploadProgress: number | null;
  currentAudioUploadName: string;
  audioUploadQueue: UploadQueueItem[];
  pendingAttachmentKind: string;
  isAttachmentDropActive: boolean;
  isUploadingAttachment: boolean;
  attachmentUploadProgress: number | null;
  currentAttachmentUploadName: string;
  attachmentUploadQueue: UploadQueueItem[];
  lastUploadSuccess: UploadSuccessCard | null;
  musicXmlDraft: string;
  selectedSongSpotifyEmbedUrl: string | null;
  availableInstrumentTabs: string[];
  selectedInstrumentTab: string;
  newSongBoardTaskTitle: string;
  songBoardColumns: { open: BoardTask[]; inProgress: BoardTask[]; done: BoardTask[] };
  threadTitle: string;
  threadBody: string;
};

export type SongWorkspaceActions = {
  setSongTab: (tab: SongTab) => void;
  setShowLeadSheetStudio: (value: boolean) => void;
  updateSong: (formData: FormData) => Promise<void>;
  setSongSettingsAlbumId: (value: string) => void;
  setBpmTapValue: (value: string) => void;
  tapBpm: () => void;
  setSongSettingsSpotifyUrl: (value: string) => void;
  setSongWorkflowStatus: (value: SongWorkflowStatus) => void;
  deleteSong: (songId: string) => Promise<void>;
  enqueueAudioFiles: (files: File[]) => void;
  setIsAudioDropActive: (value: boolean) => void;
  cancelCurrentAudioUpload: () => void;
  estimateUploadSeconds: (bytes: number) => number;
  formatBytes: (bytes: number) => string;
  retryAudioQueueItem: (itemId: string) => void;
  removeAudioQueueItem: (itemId: string) => void;
  setCurrentAudio: (value: { url: string; name: string; durationSeconds?: number | null } | null) => void;
  enqueueAttachmentFiles: (files: File[], kind: string) => void;
  setPendingAttachmentKind: (value: string) => void;
  setIsAttachmentDropActive: (value: boolean) => void;
  cancelCurrentAttachmentUpload: () => void;
  retryAttachmentQueueItem: (itemId: string) => void;
  removeAttachmentQueueItem: (itemId: string) => void;
  renameAudioQuick: (audioId: string, nextName: string) => Promise<void>;
  renameAttachmentQuick: (attachmentId: string, nextName: string) => Promise<void>;
  markAudioCurrentQuick: (audioId: string) => Promise<void>;
  postUploadToDiscussion: (upload: UploadSuccessCard) => Promise<void>;
  setMusicXmlDraft: (value: string) => void;
  saveMusicXmlDraft: () => Promise<void>;
  setSelectedInstrumentTab: (value: string) => void;
  setNewSongBoardTaskTitle: (value: string) => void;
  addSongBoardTask: () => Promise<void>;
  moveSongBoardTask: (taskId: string, status: BoardTaskStatus) => Promise<void>;
  deleteSongBoardTask: (taskId: string) => Promise<void>;
  setThreadTitle: (value: string) => void;
  setThreadBody: (value: string) => void;
  createThread: (event: FormEvent) => Promise<void>;
  addPost: (threadId: string, body: string) => Promise<void>;
};
