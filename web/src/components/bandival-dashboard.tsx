"use client";

import { DragDropContext, Draggable, Droppable, DropResult } from "@hello-pangea/dnd";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarPanel } from "@/components/panels/calendar-panel";
import { SetlistsPanel } from "@/components/panels/setlists-panel";
import { SongsPanel } from "@/components/panels/songs-panel";
import { CreateModal } from "@/components/song-detail-widgets";
import { SongWorkspace } from "@/components/song-workspace";
import { useBandData } from "@/hooks/use-band-data";
import { useInvitesController } from "@/hooks/use-invites-controller";
import { useRehearsalController } from "@/hooks/use-rehearsal-controller";

type SongAudio = {
  id: string;
  versionNumber: number;
  fileUrl: string;
  fileName: string;
  isCurrent: boolean;
  uploadedAt: string;
};

type SongAttachment = {
  id: string;
  fileName: string;
  fileUrl: string;
  kind: string;
  createdAt: string;
};

type UploadQueueItem = {
  id: string;
  file: File;
  progress: number;
  status: "queued" | "uploading" | "done" | "error" | "canceled";
  error?: string;
  kind?: string;
  uploadedId?: string;
  uploadedUrl?: string;
  uploadedName?: string;
};

type UploadSuccessCard = {
  id: string;
  fileName: string;
  fileUrl: string;
  kindLabel: string;
  isAudio: boolean;
};

type SongWorkflowStatus = "draft" | "review" | "approved" | "archived";

type BoardTaskStatus = "open" | "in_progress" | "done";

type BoardTask = {
  id: string;
  title: string;
  status: BoardTaskStatus;
  createdAt: string;
};

type BandAuditLog = {
  id: string;
  action: string;
  createdAt: string;
  payload?: {
    songId?: string;
  } | null;
};

type SongLyricsRevision = {
  id: string;
  title: string | null;
  lyricsMarkdown: string;
  revisionNumber: number;
  isCurrent: boolean;
};

type DiscussionPost = {
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

type DiscussionThread = {
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

type Song = {
  id: string;
  title: string;
  workflowStatus?: SongWorkflowStatus;
  albumId?: string | null;
  albumTrackNo?: number | null;
  album?: Album | null;
  keySignature: string | null;
  tempoBpm: string | number | null;
  durationSeconds: number | null;
  spotifyUrl: string | null;
  notes: string | null;
  chordProText?: string | null;
  updatedAt: string;
  audioVersions: SongAudio[];
  attachments: SongAttachment[];
  lyricsRevisions: SongLyricsRevision[];
  threads: DiscussionThread[];
};

type SetlistItem = {
  id: string;
  position: number;
  song: {
    id: string;
    title: string;
  };
};

type Setlist = {
  id: string;
  name: string;
  description: string | null;
  updatedAt: string;
  items: SetlistItem[];
  pdfExportUrl?: string | null;
};

type Album = {
  id: string;
  title: string;
  coverUrl?: string | null;
  songs?: Song[];
};

type BandEvent = {
  id: string;
  title: string;
  startsAt: string;
  venueLabel?: string | null;
  myAvailability?: {
    status: "available" | "maybe" | "unavailable";
    note?: string | null;
  } | null;
  availabilitySummary?: {
    availableCount: number;
    maybeCount: number;
    unavailableCount: number;
    missingResponses: number;
    memberCount: number;
    hasConflict: boolean;
    suggestedStartsAt?: string[];
  };
};

type BandPermissionsResponse = {
  role: "owner" | "admin" | "member";
  permissions: Record<string, boolean>;
  matrix: Record<string, Array<"owner" | "admin" | "member">>;
};

type BandInvite = {
  id: string;
  email: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt?: string | null;
  createdAt: string;
};

type BandMemberLite = {
  instrumentPrimary: string | null;
};

type AppNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  payload?: {
    songId?: string;
    eventId?: string;
    setlistId?: string;
  } | null;
  readAt: string | null;
  createdAt: string;
};

type RehearsalItem = {
  songId: string;
  position: number;
  song: {
    title: string;
  };
};

type RehearsalTask = {
  id: string;
  setlistId: string;
  title: string;
  isDone: boolean;
  dueAt: string | null;
  assignee?: {
    displayName?: string | null;
    email: string;
  } | null;
};

type SessionUser = {
  userId: string;
  email: string;
  defaultBandId?: string | null;
  bandIds?: string[];
};

type DashboardView = "overview" | "songs" | "setlists" | "calendar";
type ThemeMode = "system" | "light" | "dark";

const OFFLINE_QUEUE_KEY = "bandival.sync.queue";
const MAX_AUDIO_UPLOAD_BYTES = 250 * 1024 * 1024;
const MAX_ATTACHMENT_UPLOAD_BYTES = 120 * 1024 * 1024;
const ESTIMATED_UPLOAD_MBIT = 8;

function getBandCacheKey(kind: "songs" | "setlists" | "events" | "albums", bandId: string): string {
  return `bandival.cache.${kind}.${bandId}`;
}

function parseWorkflowStatus(notes: string | null): SongWorkflowStatus {
  if (!notes) {
    return "draft";
  }
  const match = notes.match(/^\[workflow:(draft|review|approved|archived)\]\n?/i);
  return (match?.[1]?.toLowerCase() as SongWorkflowStatus | undefined) ?? "draft";
}

function resolveWorkflowStatus(song: Partial<Song>): SongWorkflowStatus {
  if (song.workflowStatus) {
    return song.workflowStatus;
  }
  return parseWorkflowStatus(song.notes ?? null);
}

function toSpotifyEmbedUrl(rawUrl: string | null): string | null {
  if (!rawUrl) {
    return null;
  }

  try {
    if (rawUrl.startsWith("spotify:")) {
      const parts = rawUrl.split(":");
      if (parts.length >= 3) {
        const type = parts[1];
        const id = parts[2];
        if (type && id) {
          return `https://open.spotify.com/embed/${type}/${id}`;
        }
      }
    }

    const url = new URL(rawUrl.trim());
    if (url.hostname.includes("spotify.com")) {
      const segments = url.pathname.split("/").filter(Boolean);
      const allowed = new Set(["track", "album", "playlist", "artist", "episode", "show"]);
      for (let i = 0; i < segments.length - 1; i += 1) {
        const type = segments[i];
        const id = segments[i + 1];
        if (allowed.has(type) && id) {
          return `https://open.spotify.com/embed/${type}/${id}`;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

function generateClientId(): string {
  if (typeof window !== "undefined" && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

type SetlistMeta = {
  instruments: string[];
  equipment: string[];
};

const SETLIST_META_MARKER = "[bandival-meta]";

function normalizeTagList(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, 40);
}

function decodeSetlistDescription(description: string | null): { plainDescription: string; meta: SetlistMeta } {
  if (!description) {
    return { plainDescription: "", meta: { instruments: [], equipment: [] } };
  }

  const markerIndex = description.indexOf(SETLIST_META_MARKER);
  if (markerIndex < 0) {
    return { plainDescription: description, meta: { instruments: [], equipment: [] } };
  }

  const plainDescription = description.slice(0, markerIndex).trimEnd();
  const jsonRaw = description.slice(markerIndex + SETLIST_META_MARKER.length).trim();
  try {
    const parsed = JSON.parse(jsonRaw) as Partial<SetlistMeta>;
    return {
      plainDescription,
      meta: {
        instruments: normalizeTagList(Array.isArray(parsed.instruments) ? parsed.instruments : []),
        equipment: normalizeTagList(Array.isArray(parsed.equipment) ? parsed.equipment : []),
      },
    };
  } catch {
    return { plainDescription, meta: { instruments: [], equipment: [] } };
  }
}

function encodeSetlistDescription(plainDescription: string, meta: SetlistMeta): string | null {
  const cleanPlain = plainDescription.trim();
  const normalizedMeta: SetlistMeta = {
    instruments: normalizeTagList(meta.instruments),
    equipment: normalizeTagList(meta.equipment),
  };
  if (!cleanPlain && normalizedMeta.instruments.length === 0 && normalizedMeta.equipment.length === 0) {
    return null;
  }
  if (normalizedMeta.instruments.length === 0 && normalizedMeta.equipment.length === 0) {
    return cleanPlain || null;
  }
  const metaJson = JSON.stringify(normalizedMeta);
  return `${cleanPlain}\n${SETLIST_META_MARKER}${metaJson}`.trim();
}

function validateSpotifyInput(rawUrl: string): { embedUrl: string | null; message: string } {
  if (!rawUrl.trim()) {
    return { embedUrl: null, message: "" };
  }
  const embedUrl = toSpotifyEmbedUrl(rawUrl);
  if (embedUrl) {
    return { embedUrl, message: "Spotify-Link ist gueltig und embed-faehig." };
  }
  return {
    embedUrl: null,
    message: "Unbekannter Spotify-Link. Bitte Track-/Album-/Playlist-URL oder spotify:track:... verwenden.",
  };
}

function formatPlayerTime(totalSeconds: number | null | undefined): string {
  if (!totalSeconds || totalSeconds < 0 || !Number.isFinite(totalSeconds)) {
    return "00:00";
  }
  const safe = Math.floor(totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function BandivalDashboard({
  view = "overview",
  initialSetlistId = null,
  initialSongId = null,
}: {
  view?: DashboardView;
  initialSetlistId?: string | null;
  initialSongId?: string | null;
}) {
  const router = useRouter();
  const [bandId, setBandId] = useState<string>("");
  const [bandName, setBandName] = useState<string>("Bandival");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [authUser, setAuthUser] = useState<SessionUser | null>(null);
  const [loginEmail, setLoginEmail] = useState<string>("demo@bandival.local");
  const [loginPassword, setLoginPassword] = useState<string>("bandival123");
  const [songs, setSongs] = useState<Song[]>([]);
  const [setlists, setSetlists] = useState<Setlist[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [events, setEvents] = useState<BandEvent[]>([]);
  const [invites, setInvites] = useState<BandInvite[]>([]);
  const [inviteFilter, setInviteFilter] = useState<"all" | "open" | "expired" | "accepted" | "revoked">("all");
  const [selectedInviteIds, setSelectedInviteIds] = useState<string[]>([]);
  const [bandPermissions, setBandPermissions] = useState<BandPermissionsResponse | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [auditLogs, setAuditLogs] = useState<BandAuditLog[]>([]);
  const [inviteEmail, setInviteEmail] = useState<string>("");
  const [lastInviteLink, setLastInviteLink] = useState<string>("");
  const [inviteTokenInput, setInviteTokenInput] = useState<string>("");
  const [rehearsalItems, setRehearsalItems] = useState<RehearsalItem[]>([]);
  const [rehearsalNotes, setRehearsalNotes] = useState<Record<string, string>>({});
  const [, setRehearsalTasks] = useState<RehearsalTask[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState<string>("");
  const [newTaskDueAt, setNewTaskDueAt] = useState<string>("");
  const [rehearsalElapsedSec, setRehearsalElapsedSec] = useState<number>(0);
  const [rehearsalRunning, setRehearsalRunning] = useState<boolean>(false);
  const [selectedSongId, setSelectedSongId] = useState<string | null>(initialSongId);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [selectedSetlistId, setSelectedSetlistId] = useState<string | null>(initialSetlistId);
  const [activeSidebar, setActiveSidebar] = useState<"songs" | "setlists">(view === "setlists" ? "setlists" : "songs");
  const [statusMessage, setStatusMessage] = useState<string>("Bandival bereit.");
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const isEditMode = true;
  const [isStageMode, setIsStageMode] = useState<boolean>(false);
  const [newAlbumTitle, setNewAlbumTitle] = useState<string>("");
  const [newSongTitle, setNewSongTitle] = useState<string>("");
  const [newSongSpotifyUrl, setNewSongSpotifyUrl] = useState<string>("");
  const [newSongKeySignature, setNewSongKeySignature] = useState<string>("");
  const [newSongTempoBpm, setNewSongTempoBpm] = useState<string>("");
  const [newSongDurationMinutes, setNewSongDurationMinutes] = useState<string>("");
  const [newSongDurationSeconds, setNewSongDurationSeconds] = useState<string>("");
  const [newSongAlbumId, setNewSongAlbumId] = useState<string>("");
  const [newSetlistName, setNewSetlistName] = useState<string>("");
  const [newSetlistDescription, setNewSetlistDescription] = useState<string>("");
  const [newSetlistSongIds, setNewSetlistSongIds] = useState<string[]>([]);
  const [threadTitle, setThreadTitle] = useState<string>("");
  const [threadBody, setThreadBody] = useState<string>("");
  const [newEventTitle, setNewEventTitle] = useState<string>("");
  const [newEventStartsAt, setNewEventStartsAt] = useState<string>("");
  const [newEventVenueLabel, setNewEventVenueLabel] = useState<string>("");
  const [newEventRecurrenceEveryDays, setNewEventRecurrenceEveryDays] = useState<string>("");
  const [newEventRecurrenceCount, setNewEventRecurrenceCount] = useState<string>("");
  const [musicXmlDraft, setMusicXmlDraft] = useState<string>("");
  const [currentAudio, setCurrentAudio] = useState<{ url: string; name: string; durationSeconds?: number | null } | null>(null);
  const [isAutoScroll, setIsAutoScroll] = useState<boolean>(false);
  const [autoScrollSpeed, setAutoScrollSpeed] = useState<number>(0.65);
  const [nowMs, setNowMs] = useState<number>(0);
  const [showCreateSongModal, setShowCreateSongModal] = useState(false);
  const [showCreateAlbumModal, setShowCreateAlbumModal] = useState(false);
  const [showCreateSetlistModal, setShowCreateSetlistModal] = useState(false);
  const [showLeadSheetStudio, setShowLeadSheetStudio] = useState(false);
  const [songTab, setSongTab] = useState<"overview" | "edit" | "files" | "chords" | "discussion">("overview");
  const [showNotifications, setShowNotifications] = useState(false);
  const [selectedCalendarMonth, setSelectedCalendarMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [songWorkflowStatus, setSongWorkflowStatus] = useState<SongWorkflowStatus>("draft");
  const [, setBpmTapHistory] = useState<number[]>([]);
  const [bpmTapValue, setBpmTapValue] = useState<string>("");
  const [segmentRunning, setSegmentRunning] = useState<boolean>(false);
  const [segmentElapsedSec, setSegmentElapsedSec] = useState<number>(0);
  const [segmentSongId, setSegmentSongId] = useState<string | null>(null);
  const [segmentPlanMinutes, setSegmentPlanMinutes] = useState<Record<string, number>>({});
  const [setlistBoardTasks, setSetlistBoardTasks] = useState<Record<string, BoardTask[]>>({});
  const [songBoardTasks, setSongBoardTasks] = useState<Record<string, BoardTask[]>>({});
  const [newSetlistBoardTaskTitle, setNewSetlistBoardTaskTitle] = useState<string>("");
  const [newSongBoardTaskTitle, setNewSongBoardTaskTitle] = useState<string>("");
  const [audioUploadProgress, setAudioUploadProgress] = useState<number | null>(null);
  const [attachmentUploadProgress, setAttachmentUploadProgress] = useState<number | null>(null);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [currentAudioUploadName, setCurrentAudioUploadName] = useState<string>("");
  const [currentAttachmentUploadName, setCurrentAttachmentUploadName] = useState<string>("");
  const [audioUploadQueue, setAudioUploadQueue] = useState<UploadQueueItem[]>([]);
  const [attachmentUploadQueue, setAttachmentUploadQueue] = useState<UploadQueueItem[]>([]);
  const [pendingAttachmentKind, setPendingAttachmentKind] = useState<string>("other");
  const [isAudioDropActive, setIsAudioDropActive] = useState(false);
  const [isAttachmentDropActive, setIsAttachmentDropActive] = useState(false);
  const [lastUploadSuccess, setLastUploadSuccess] = useState<UploadSuccessCard | null>(null);
  const [dayAvailabilities, setDayAvailabilities] = useState<Record<string, {
    myStatus: "available" | "maybe" | "unavailable" | null;
    summary: {
      availableCount: number;
      maybeCount: number;
      unavailableCount: number;
      missingResponses: number;
    };
  }>>({});
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const mainContentRef = useRef<HTMLElement | null>(null);
  const audioCancelRef = useRef<(() => void) | null>(null);
  const attachmentCancelRef = useRef<(() => void) | null>(null);
  const [setlistEditorSongIds, setSetlistEditorSongIds] = useState<string[]>([]);
  const [setlistSongSearch, setSetlistSongSearch] = useState<string>("");
  const [songSettingsAlbumId, setSongSettingsAlbumId] = useState<string>("");
  const [songSettingsSpotifyUrl, setSongSettingsSpotifyUrl] = useState<string>("");
  const [leadSheetDraftChordPro, setLeadSheetDraftChordPro] = useState<string>("");
  const [leadSheetDraftLyrics, setLeadSheetDraftLyrics] = useState<string>("");
  const [bandInstruments, setBandInstruments] = useState<string[]>([]);
  const [selectedInstrumentTab, setSelectedInstrumentTab] = useState<string>("Band");
  const [setlistDescriptionDraft, setSetlistDescriptionDraft] = useState<string>("");
  const [setlistInstrumentsDraft, setSetlistInstrumentsDraft] = useState<string[]>([]);
  const [setlistEquipmentDraft, setSetlistEquipmentDraft] = useState<string[]>([]);
  const [setlistInstrumentInput, setSetlistInstrumentInput] = useState<string>("");
  const [setlistEquipmentInput, setSetlistEquipmentInput] = useState<string>("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const stickyAudioRef = useRef<HTMLAudioElement | null>(null);
  const [stickyIsPlaying, setStickyIsPlaying] = useState(false);
  const [stickyCurrentSec, setStickyCurrentSec] = useState(0);
  const [stickyDurationSec, setStickyDurationSec] = useState(0);
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");

  const can = (action: string): boolean => Boolean(bandPermissions?.permissions?.[action]);
  const normalizeSong = useCallback(
    (song: Partial<Song> & { id: string; title: string; updatedAt: string }): Song => ({
      id: song.id,
      title: song.title,
      workflowStatus: resolveWorkflowStatus(song),
      albumId: song.albumId ?? null,
      albumTrackNo: song.albumTrackNo ?? null,
      album: song.album ?? null,
      keySignature: song.keySignature ?? null,
      tempoBpm: song.tempoBpm ?? null,
      durationSeconds: song.durationSeconds ?? null,
      spotifyUrl: song.spotifyUrl ?? null,
      notes: song.notes ?? null,
      chordProText: song.chordProText ?? null,
      updatedAt: song.updatedAt,
      audioVersions: song.audioVersions ?? [],
      attachments: song.attachments ?? [],
      lyricsRevisions: song.lyricsRevisions ?? [],
      threads: song.threads ?? [],
    }),
    [],
  );

  const {
    selectedSong,
    selectedSetlist,
    selectedAlbum,
    filteredSongs,
    filteredSetlists,
    visibleInvites,
    unreadNotificationCount,
    nextEvent,
  } = useBandData({
    songs,
    setlists,
    albums,
    events,
    notifications,
    invites,
    inviteFilter,
    bandPermissions,
    selectedSongId,
    selectedSetlistId,
    selectedAlbumId,
    searchQuery,
    nowMs,
  });

  const searchSuggestions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2) {
      return [] as Array<{ kind: "song" | "setlist"; id: string; title: string; subtitle: string }>;
    }

    const songHits = songs
      .filter((song) => (`${song.title} ${song.album?.title ?? ""}`).toLowerCase().includes(q))
      .slice(0, 6)
      .map((song) => ({
        kind: "song" as const,
        id: song.id,
        title: song.title,
        subtitle: song.album?.title ?? "Song",
      }));

    const setlistHits = setlists
      .filter((setlist) => (`${setlist.name} ${setlist.description ?? ""}`).toLowerCase().includes(q))
      .slice(0, 4)
      .map((setlist) => ({
        kind: "setlist" as const,
        id: setlist.id,
        title: setlist.name,
        subtitle: "Setlist",
      }));

    return [...songHits, ...setlistHits].slice(0, 8);
  }, [searchQuery, songs, setlists]);

  function selectSearchSuggestion(item: { kind: "song" | "setlist"; id: string; title: string }) {
    setSearchQuery(item.title);
    setIsSearchFocused(false);
    if (item.kind === "song") {
      setActiveSidebar("songs");
      setSelectedSongId(item.id);
      void refreshSong(item.id);
      return;
    }
    setActiveSidebar("setlists");
    setSelectedSetlistId(item.id);
  }

  useEffect(() => {
    setNowMs(Date.now());
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem("bandival.theme") as ThemeMode | null;
    if (stored === "light" || stored === "dark" || stored === "system") {
      setThemeMode(stored);
    }
  }, []);

  useEffect(() => {
    const applyTheme = () => {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const resolved = themeMode === "system" ? (prefersDark ? "dark" : "light") : themeMode;
      document.documentElement.setAttribute("data-theme", resolved);
      document.documentElement.style.colorScheme = resolved;
    };

    applyTheme();
    window.localStorage.setItem("bandival.theme", themeMode);

    if (themeMode !== "system") {
      return;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [themeMode]);

  const cycleTheme = useCallback(() => {
    const order: ThemeMode[] = ["system", "light", "dark"];
    setThemeMode((prev) => {
      const idx = order.indexOf(prev);
      return order[(idx + 1) % order.length];
    });
  }, []);

  useEffect(() => {
    const onThemeShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "l")) {
        return;
      }
      event.preventDefault();
      cycleTheme();
    };

    window.addEventListener("keydown", onThemeShortcut);
    return () => window.removeEventListener("keydown", onThemeShortcut);
  }, [cycleTheme]);

  const currentThemeLabel = themeMode === "system" ? "Auto" : themeMode === "dark" ? "Dark" : "Light";

  useEffect(() => {
    if (initialSongId) {
      setSelectedSongId(initialSongId);
      setActiveSidebar("songs");
    }
  }, [initialSongId]);

  useEffect(() => {
    const audioEl = stickyAudioRef.current;
    if (!audioEl) {
      return;
    }

    const onPlay = () => setStickyIsPlaying(true);
    const onPause = () => setStickyIsPlaying(false);
    const onTime = () => setStickyCurrentSec(audioEl.currentTime || 0);
    const onMeta = () => {
      setStickyDurationSec(Number.isFinite(audioEl.duration) && audioEl.duration > 0 ? audioEl.duration : (currentAudio?.durationSeconds ?? 0));
    };

    audioEl.addEventListener("play", onPlay);
    audioEl.addEventListener("pause", onPause);
    audioEl.addEventListener("timeupdate", onTime);
    audioEl.addEventListener("loadedmetadata", onMeta);

    return () => {
      audioEl.removeEventListener("play", onPlay);
      audioEl.removeEventListener("pause", onPause);
      audioEl.removeEventListener("timeupdate", onTime);
      audioEl.removeEventListener("loadedmetadata", onMeta);
    };
  }, [currentAudio?.durationSeconds, currentAudio?.url]);

  useEffect(() => {
    setStickyCurrentSec(0);
    setStickyDurationSec(currentAudio?.durationSeconds && currentAudio.durationSeconds > 0 ? currentAudio.durationSeconds : 0);
  }, [currentAudio?.durationSeconds, currentAudio?.url]);

  useEffect(() => {
    setSongTab("overview");
    setBpmTapHistory([]);
    setBpmTapValue(selectedSong?.tempoBpm?.toString() ?? "");
    setSongWorkflowStatus(selectedSong?.workflowStatus ?? parseWorkflowStatus(selectedSong?.notes ?? null));
    setAudioUploadQueue([]);
    setAttachmentUploadQueue([]);
    setLastUploadSuccess(null);
    setAudioUploadProgress(null);
    setAttachmentUploadProgress(null);
    setSongSettingsAlbumId(selectedSong?.albumId ?? "");
    setSongSettingsSpotifyUrl(selectedSong?.spotifyUrl ?? "");
    setLeadSheetDraftChordPro(selectedSong?.chordProText ?? "");
    setLeadSheetDraftLyrics(selectedSong?.lyricsRevisions[0]?.lyricsMarkdown ?? "");
    setSelectedInstrumentTab("Band");
  }, [selectedSong?.albumId, selectedSong?.chordProText, selectedSong?.id, selectedSong?.lyricsRevisions, selectedSong?.notes, selectedSong?.spotifyUrl, selectedSong?.tempoBpm, selectedSong?.workflowStatus]);

  useEffect(() => {
    if (view === "setlists") {
      setActiveSidebar("setlists");
    }
  }, [view]);

  useEffect(() => {
    if (availableInstrumentTabs.includes(selectedInstrumentTab)) {
      return;
    }
    setSelectedInstrumentTab(availableInstrumentTabs[0] ?? "Band");
  }, [availableInstrumentTabs, selectedInstrumentTab]);

  useEffect(() => {
    if (!initialSetlistId) {
      return;
    }
    setSelectedSetlistId(initialSetlistId);
    setActiveSidebar("setlists");
  }, [initialSetlistId]);

  useEffect(() => () => {
    audioCancelRef.current?.();
    attachmentCancelRef.current?.();
  }, []);

  function formatInviteStatus(invite: BandInvite): string {
    if (invite.revokedAt) {
      return `widerrufen (${new Date(invite.revokedAt).toLocaleDateString("de-DE")})`;
    }

    if (invite.acceptedAt) {
      return "angenommen";
    }

    const diffMs = new Date(invite.expiresAt).getTime() - Date.now();
    if (diffMs <= 0) {
      return `abgelaufen (${new Date(invite.expiresAt).toLocaleDateString("de-DE")})`;
    }

    const daysLeft = Math.max(1, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
    return `gueltig bis ${new Date(invite.expiresAt).toLocaleDateString("de-DE")} (${daysLeft} Tage)`;
  }

  const smartSetlistSuggestions = useMemo(() => {
    if (!selectedSetlist) {
      return [] as Song[];
    }

    const setlistSongIds = new Set(selectedSetlist.items.map((item) => item.song.id));
    const lastSongId = selectedSetlist.items[selectedSetlist.items.length - 1]?.song.id;
    const lastSong = songs.find((song) => song.id === lastSongId) ?? null;
    const toTempo = (value: Song["tempoBpm"]): number => Number(value ?? 0) || 0;

    const activityBySongId = auditLogs.reduce<Record<string, number>>((acc, log) => {
      const songId = log.payload?.songId;
      if (songId) {
        acc[songId] = (acc[songId] ?? 0) + 1;
      }
      return acc;
    }, {});

    return songs
      .filter((song) => !setlistSongIds.has(song.id))
      .map((song) => {
        const workflow = song.workflowStatus ?? "draft";
        const tempoGap = lastSong ? Math.abs(toTempo(song.tempoBpm) - toTempo(lastSong.tempoBpm)) : 0;
        const keyMatch = lastSong && song.keySignature && lastSong.keySignature && song.keySignature === lastSong.keySignature ? -18 : 0;
        const workflowBonus = workflow === "approved" ? -25 : workflow === "review" ? -12 : workflow === "archived" ? 35 : 0;
        const activityBonus = Math.min(activityBySongId[song.id] ?? 0, 12);
        return { song, score: tempoGap + keyMatch + workflowBonus - activityBonus };
      })
      .sort((a, b) => a.score - b.score)
      .slice(0, 6)
      .map((entry) => entry.song);
  }, [auditLogs, selectedSetlist, songs]);

  const criticalEvents = useMemo(
    () => events.filter((event) => {
      const summary = event.availabilitySummary;
      if (!summary) {
        return false;
      }
      return summary.hasConflict || summary.availableCount < 2 || summary.unavailableCount >= summary.availableCount || summary.missingResponses > summary.availableCount;
    }),
    [events],
  );

  const selectedSetlistBoard = useMemo(
    () => (selectedSetlistId ? (setlistBoardTasks[selectedSetlistId] ?? []) : []),
    [selectedSetlistId, setlistBoardTasks],
  );
  const selectedSongBoard = useMemo(
    () => (selectedSongId ? (songBoardTasks[selectedSongId] ?? []) : []),
    [selectedSongId, songBoardTasks],
  );

  const setlistBoardColumns = useMemo(
    () => ({
      open: selectedSetlistBoard.filter((task) => task.status === "open"),
      inProgress: selectedSetlistBoard.filter((task) => task.status === "in_progress"),
      done: selectedSetlistBoard.filter((task) => task.status === "done"),
    }),
    [selectedSetlistBoard],
  );

  const songBoardColumns = useMemo(
    () => ({
      open: selectedSongBoard.filter((task) => task.status === "open"),
      inProgress: selectedSongBoard.filter((task) => task.status === "in_progress"),
      done: selectedSongBoard.filter((task) => task.status === "done"),
    }),
    [selectedSongBoard],
  );

  const selectedSongSpotifyEmbedUrl = useMemo(
    () => toSpotifyEmbedUrl(selectedSong?.spotifyUrl ?? null),
    [selectedSong],
  );

  const createSongSpotifyValidation = useMemo(
    () => validateSpotifyInput(newSongSpotifyUrl),
    [newSongSpotifyUrl],
  );

  const editSongSpotifyValidation = useMemo(
    () => validateSpotifyInput(songSettingsSpotifyUrl),
    [songSettingsSpotifyUrl],
  );

  const selectedSetlistDecoded = useMemo(
    () => decodeSetlistDescription(selectedSetlist?.description ?? null),
    [selectedSetlist?.description],
  );

  const availableInstrumentTabs = useMemo(() => {
    const values = Array.from(new Set(["Band", ...bandInstruments])).filter(Boolean);
    return values;
  }, [bandInstruments]);

  const filteredSetlistCandidateSongs = useMemo(() => {
    if (!selectedSetlist) {
      return [] as Song[];
    }
    const q = setlistSongSearch.trim().toLowerCase();
    return songs
      .filter((song) => {
        if (!q) {
          return true;
        }
        return `${song.title} ${song.keySignature ?? ""}`.toLowerCase().includes(q);
      })
      .slice(0, 60);
  }, [selectedSetlist, setlistSongSearch, songs]);

  useEffect(() => {
    if (!selectedSetlist) {
      setSetlistEditorSongIds([]);
      setSetlistDescriptionDraft("");
      setSetlistInstrumentsDraft([]);
      setSetlistEquipmentDraft([]);
      return;
    }
    setSetlistEditorSongIds(selectedSetlist.items.map((item) => item.song.id));
    setSetlistDescriptionDraft(selectedSetlistDecoded.plainDescription);
    setSetlistInstrumentsDraft(selectedSetlistDecoded.meta.instruments);
    setSetlistEquipmentDraft(selectedSetlistDecoded.meta.equipment);
  }, [selectedSetlist, selectedSetlistDecoded]);


  const showSongsWorkspace = view === "overview" || view === "songs";
  const showSetlistsWorkspace = view === "overview" || view === "setlists";
  const showCalendarWorkspace = view === "overview" || view === "calendar";
  const showAnyWorkspace = showSongsWorkspace || showSetlistsWorkspace || showCalendarWorkspace;
  const showSongsEmptyState = showSongsWorkspace && !isLoading && songs.length === 0;
  const showSetlistsEmptyState = showSetlistsWorkspace && !isLoading && setlists.length === 0;
  const showCalendarEmptyState = showCalendarWorkspace && !isLoading && events.length === 0;
  const showSongSelectionGuide = showSongsWorkspace && !isLoading && songs.length > 0 && !selectedSong;

  useEffect(() => {
    const storedBandId = window.localStorage.getItem("bandival.bandId");
    const tokenFromQuery = new URLSearchParams(window.location.search).get("inviteToken")
      ?? new URLSearchParams(window.location.search).get("token");

    // Cleanup obsolete pre-band-scoped cache keys from older versions.
    window.localStorage.removeItem("bandival.cache.songs");
    window.localStorage.removeItem("bandival.cache.setlists");
    window.localStorage.removeItem("bandival.cache.events");
    window.localStorage.removeItem("bandival.cache.albums");

    if (storedBandId) {
      const cachedSongs = window.localStorage.getItem(getBandCacheKey("songs", storedBandId));
      const cachedSetlists = window.localStorage.getItem(getBandCacheKey("setlists", storedBandId));
      const cachedEvents = window.localStorage.getItem(getBandCacheKey("events", storedBandId));
      const cachedAlbums = window.localStorage.getItem(getBandCacheKey("albums", storedBandId));
      if (cachedSongs) {
        setSongs((JSON.parse(cachedSongs) as Array<Partial<Song> & { id: string; title: string; updatedAt: string }>).map(normalizeSong));
      }
      if (cachedSetlists) {
        setSetlists(JSON.parse(cachedSetlists));
      }
      if (cachedEvents) {
        setEvents(JSON.parse(cachedEvents));
      }
      if (cachedAlbums) {
        setAlbums(JSON.parse(cachedAlbums));
      }
      setStatusMessage("Offline-Cache vorgeladen. Synchronisiere ...");
    }

    if (tokenFromQuery) {
      setInviteTokenInput(tokenFromQuery);
    }

    void refreshSession(storedBandId ?? undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizeSong]);

  useEffect(() => {
    void applyStageMode(isStageMode);
  }, [isStageMode]);

  useEffect(() => {
    if (!isStageMode || !isAutoScroll || !mainContentRef.current) {
      return;
    }

    let rafId = 0;
    const tick = () => {
      if (mainContentRef.current) {
        mainContentRef.current.scrollTop += autoScrollSpeed;
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isStageMode, isAutoScroll, autoScrollSpeed]);

  useEffect(() => {
    const isErrorMessage = /fehlgeschlagen|konnte nicht|ungueltig|ungültig|no membership|access denied|keine berechtigung|nicht geladen|nicht gespeichert|nicht aktualisiert|nicht erstellt|error/i.test(statusMessage);
    if (!isErrorMessage) {
      return;
    }

    setErrorToast(statusMessage);
    const timeoutId = window.setTimeout(() => setErrorToast(null), 6000);
    return () => window.clearTimeout(timeoutId);
  }, [statusMessage]);

  useEffect(() => {
    if (!successToast) {
      return;
    }
    const timeoutId = window.setTimeout(() => setSuccessToast(null), 3200);
    return () => window.clearTimeout(timeoutId);
  }, [successToast]);

  useEffect(() => {
    if (!isStageMode) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space" || event.code === "Enter") {
        event.preventDefault();
        setIsAutoScroll((prev) => !prev);
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setAutoScrollSpeed((prev) => Math.max(0.2, prev - 0.15));
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setAutoScrollSpeed((prev) => Math.min(4, prev + 0.15));
      }

      if (["PageDown", "n", "N", "ArrowRight"].includes(event.key)) {
        event.preventDefault();
        if (selectedSetlist?.items.length) {
          const currentIndex = selectedSetlist.items.findIndex((item) => item.song.id === selectedSongId);
          const nextIndex =
            currentIndex < 0 ? 0 : (currentIndex + 1 + selectedSetlist.items.length) % selectedSetlist.items.length;
          const nextSongId = selectedSetlist.items[nextIndex]?.song.id;
          if (nextSongId) {
            setSelectedSongId(nextSongId);
            void refreshSong(nextSongId);
          }
        }
      }

      if (["PageUp", "p", "P", "ArrowLeft"].includes(event.key)) {
        event.preventDefault();
        if (selectedSetlist?.items.length) {
          const currentIndex = selectedSetlist.items.findIndex((item) => item.song.id === selectedSongId);
          const nextIndex =
            currentIndex < 0
              ? 0
              : (currentIndex - 1 + selectedSetlist.items.length) % selectedSetlist.items.length;
          const nextSongId = selectedSetlist.items[nextIndex]?.song.id;
          if (nextSongId) {
            setSelectedSongId(nextSongId);
            void refreshSong(nextSongId);
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStageMode, selectedSetlist, selectedSongId]);

  useEffect(() => {
    const onOnline = () => {
      void flushOfflineQueue();
      window.location.reload();
    };

    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!rehearsalRunning) {
      return;
    }

    const interval = window.setInterval(() => {
      setRehearsalElapsedSec((prev) => prev + 1);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [rehearsalRunning]);

  useEffect(() => {
    if (!segmentRunning) {
      return;
    }

    const interval = window.setInterval(() => {
      setSegmentElapsedSec((prev) => prev + 1);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [segmentRunning]);

  function readCookie(name: string): string | null {
    const match = document.cookie
      .split(";")
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith(`${name}=`));
    return match ? decodeURIComponent(match.split("=").slice(1).join("=")) : null;
  }

  const apiFetch = useCallback(async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const method = (init.method ?? "GET").toUpperCase();
    const headers = new Headers(init.headers ?? undefined);

    if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
      headers.set("x-csrf-token", readCookie("bandival_csrf") ?? "");
    }

    return fetch(input, { ...init, headers });
  }, []);

  const uploadWithProgress = useCallback((
    url: string,
    formData: FormData,
    onProgress: (value: number) => void,
  ): {
    cancel: () => void;
    promise: Promise<{ ok: boolean; status: number; data: { error?: string } & Record<string, unknown> }>;
  } => {
    const xhr = new XMLHttpRequest();
    const promise = new Promise<{ ok: boolean; status: number; data: { error?: string } & Record<string, unknown> }>((resolve, reject) => {
      xhr.open("POST", url);
      const csrf = readCookie("bandival_csrf") ?? "";
      if (csrf) {
        xhr.setRequestHeader("x-csrf-token", csrf);
      }

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable || event.total <= 0) {
          return;
        }
        const pct = Math.max(0, Math.min(99, Math.round((event.loaded / event.total) * 100)));
        onProgress(pct);
      };

      xhr.onerror = () => reject(new Error("Netzwerkfehler beim Upload."));
      xhr.onabort = () => reject(new Error("Upload abgebrochen."));
      xhr.onload = () => {
        let data: { error?: string } & Record<string, unknown> = {};
        const raw = xhr.responseText;
        if (raw) {
          try {
            data = JSON.parse(raw) as { error?: string } & Record<string, unknown>;
          } catch {
            data = {};
          }
        }

        onProgress(100);
        resolve({
          ok: xhr.status >= 200 && xhr.status < 300,
          status: xhr.status,
          data,
        });
      };

      xhr.send(formData);
    });

    return {
      cancel: () => xhr.abort(),
      promise,
    };
  }, []);

  function formatBytes(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes} B`;
    }

    const units = ["KB", "MB", "GB"];
    let value = bytes / 1024;
    let unit = units[0];
    for (let index = 1; index < units.length && value >= 1024; index += 1) {
      value /= 1024;
      unit = units[index];
    }

    return `${value.toFixed(1)} ${unit}`;
  }

  function estimateUploadSeconds(fileSizeBytes: number): number {
    const bytesPerSecond = (ESTIMATED_UPLOAD_MBIT * 1_000_000) / 8;
    return Math.max(1, Math.round(fileSizeBytes / bytesPerSecond));
  }

  function validateUploadFile(file: File, mode: "audio" | "attachment"): string | null {
    if (mode === "audio") {
      if (!file.type.startsWith("audio/")) {
        return "Nur Audio-Dateien erlaubt.";
      }
      if (file.size > MAX_AUDIO_UPLOAD_BYTES) {
        return `Datei zu gross (max ${formatBytes(MAX_AUDIO_UPLOAD_BYTES)}).`;
      }
      return null;
    }

    if (file.size > MAX_ATTACHMENT_UPLOAD_BYTES) {
      return `Datei zu gross (max ${formatBytes(MAX_ATTACHMENT_UPLOAD_BYTES)}).`;
    }

    return null;
  }

  const loadDayAvailabilities = useCallback(async (targetBandId: string, month: string) => {
    const res = await apiFetch(`/api/events/day-availability?bandId=${targetBandId}&month=${month}`);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error ?? "Tagesverfuegbarkeit konnte nicht geladen werden.");
    }

    const map = Object.fromEntries(
      (data.days ?? []).map((day: {
        date: string;
        myStatus: "available" | "maybe" | "unavailable" | null;
        summary: { availableCount: number; maybeCount: number; unavailableCount: number; missingResponses: number };
      }) => [day.date, { myStatus: day.myStatus, summary: day.summary }]),
    ) as Record<string, {
      myStatus: "available" | "maybe" | "unavailable" | null;
      summary: { availableCount: number; maybeCount: number; unavailableCount: number; missingResponses: number };
    }>;
    setDayAvailabilities(map);
  }, [apiFetch]);

  const setDayAvailability = useCallback(async (date: string, status: "available" | "maybe" | "unavailable") => {
    if (!bandId) {
      return;
    }

    try {
      const res = await apiFetch("/api/events/day-availability", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bandId, date, status }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Tagesverfuegbarkeit konnte nicht gespeichert werden.");
      }

      const eventsRes = await apiFetch(`/api/events?bandId=${bandId}`);
      const eventsData = await eventsRes.json();
      if (eventsRes.ok) {
        setEvents(eventsData.events ?? []);
      }
      await loadDayAvailabilities(bandId, selectedCalendarMonth);
      setStatusMessage("Tagesverfuegbarkeit aktualisiert.");
      setSuccessToast(`Verfuegbarkeit gesetzt: ${date}`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Tagesverfuegbarkeit fehlgeschlagen.");
    }
  }, [apiFetch, bandId, loadDayAvailabilities, selectedCalendarMonth]);

  const setDayAvailabilityBulk = useCallback(async (dates: string[], status: "available" | "maybe" | "unavailable") => {
    if (!bandId || dates.length === 0) {
      return;
    }

    try {
      const results = await Promise.all(
        dates.map(async (date) => {
          const res = await apiFetch("/api/events/day-availability", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bandId, date, status }),
          });
          const data = await res.json();
          return { ok: res.ok, message: data.error as string | undefined };
        }),
      );

      const failures = results.filter((entry) => !entry.ok);
      if (failures.length > 0) {
        throw new Error(failures[0].message ?? "Mindestens eine Tagesverfuegbarkeit konnte nicht gespeichert werden.");
      }

      const eventsRes = await apiFetch(`/api/events?bandId=${bandId}`);
      const eventsData = await eventsRes.json();
      if (eventsRes.ok) {
        setEvents(eventsData.events ?? []);
      }
      await loadDayAvailabilities(bandId, selectedCalendarMonth);
      setStatusMessage(`${dates.length} Tagesverfuegbarkeiten aktualisiert.`);
      setSuccessToast(`${dates.length} Tage auf ${status} gesetzt.`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Mehrfach-Update der Tagesverfuegbarkeit fehlgeschlagen.");
    }
  }, [apiFetch, bandId, loadDayAvailabilities, selectedCalendarMonth]);

  async function applyStageMode(enabled: boolean) {
    if (!("wakeLock" in navigator)) {
      return;
    }

    try {
      if (enabled && !wakeLockRef.current) {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
      } else if (!enabled && wakeLockRef.current) {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    } catch {
      setStatusMessage("Stage-Modus aktiv, Wake Lock vom Browser nicht erlaubt.");
    }
  }

  function queueOfflineAction(action: unknown) {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown[]) : [];
    parsed.push(action);
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(parsed));
  }

  const flushOfflineQueue = useCallback(async () => {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) {
      return;
    }

    const actions = JSON.parse(raw) as Array<{ kind: string; setlistId: string; orderedItemIds: string[] }>;
    for (const action of actions) {
      if (action.kind === "setlist-reorder") {
        await apiFetch(`/api/setlists/${action.setlistId}/reorder`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderedItemIds: action.orderedItemIds }),
        });
      }
    }

    localStorage.removeItem(OFFLINE_QUEUE_KEY);
    setStatusMessage("Offline-Aenderungen synchronisiert.");
  }, [apiFetch]);

  const loadData = useCallback(async (targetBandId: string) => {
    if (!targetBandId || targetBandId.length !== 36) {
      setStatusMessage("Bitte eine gueltige bandId eintragen.");
      return;
    }

    setIsLoading(true);

    try {
      const [songsRes, setlistsRes, albumsRes, eventsRes, bandRes, invitesRes, permissionsRes, notificationsRes, auditRes, membersRes] = await Promise.all([
        apiFetch(`/api/songs?bandId=${targetBandId}`),
        apiFetch(`/api/setlists?bandId=${targetBandId}`),
        apiFetch(`/api/albums?bandId=${targetBandId}`),
        apiFetch(`/api/events?bandId=${targetBandId}`),
        apiFetch(`/api/bands/${targetBandId}`),
        apiFetch(`/api/bands/${targetBandId}/invites?status=all`),
        apiFetch(`/api/bands/${targetBandId}/permissions`),
        apiFetch(`/api/notifications?limit=30`),
        apiFetch(`/api/bands/${targetBandId}/audit?limit=200`),
        apiFetch(`/api/bands/${targetBandId}/members`),
      ]);

      const songsData = await songsRes.json();
      const setlistsData = await setlistsRes.json();
      const albumsData = await albumsRes.json();
      const eventsData = await eventsRes.json();
      const bandData = await bandRes.json();
      const invitesData = await invitesRes.json();
      const permissionsData = await permissionsRes.json();
      const notificationsData = await notificationsRes.json();
      const auditData = await auditRes.json();
      const membersData = await membersRes.json();

      if (!songsRes.ok) {
        throw new Error(songsData.error ?? "Songs konnten nicht geladen werden.");
      }

      if (!setlistsRes.ok) {
        throw new Error(setlistsData.error ?? "Setlists konnten nicht geladen werden.");
      }

      if (!albumsRes.ok) {
        throw new Error(albumsData.error ?? "Alben konnten nicht geladen werden.");
      }

      if (!eventsRes.ok) {
        throw new Error(eventsData.error ?? "Kalender konnte nicht geladen werden.");
      }

      if (!bandRes.ok) {
        throw new Error(bandData.error ?? "Banddaten konnten nicht geladen werden.");
      }

      if (!invitesRes.ok) {
        throw new Error(invitesData.error ?? "Einladungen konnten nicht geladen werden.");
      }

      if (!permissionsRes.ok) {
        throw new Error(permissionsData.error ?? "Berechtigungen konnten nicht geladen werden.");
      }

      if (!notificationsRes.ok) {
        throw new Error(notificationsData.error ?? "Notifications konnten nicht geladen werden.");
      }

      if (!auditRes.ok) {
        throw new Error(auditData.error ?? "Aktivitaetslog konnte nicht geladen werden.");
      }

      if (!membersRes.ok) {
        throw new Error(membersData.error ?? "Bandmitglieder konnten nicht geladen werden.");
      }

      setSongs(
        ((songsData.songs ?? []) as Array<Partial<Song> & { id: string; title: string; updatedAt: string }>).map(
          normalizeSong,
        ),
      );
      const nextSongs = (songsData.songs ?? []) as Array<Partial<Song> & { id: string; title: string; updatedAt: string }>;
      const nextSetlists = (setlistsData.setlists ?? []) as Setlist[];
      const nextAlbums = (albumsData.albums ?? []) as Album[];

      setSetlists(nextSetlists);
      setAlbums(nextAlbums);
      setEvents(eventsData.events ?? []);
      setBandName(bandData.band?.name ?? "Bandival");
      setInvites(invitesData.invites ?? []);
      setSelectedInviteIds([]);
      setBandPermissions(permissionsData);
      setNotifications(notificationsData.notifications ?? []);
      setAuditLogs(auditData.logs ?? []);
      const instruments = Array.from(
        new Set(
          ((membersData.members ?? []) as BandMemberLite[])
            .map((member) => member.instrumentPrimary?.trim() ?? "")
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b, "de"));
      setBandInstruments(instruments);
      await loadDayAvailabilities(targetBandId, selectedCalendarMonth);

      localStorage.setItem(getBandCacheKey("songs", targetBandId), JSON.stringify(songsData.songs ?? []));
      localStorage.setItem(getBandCacheKey("setlists", targetBandId), JSON.stringify(setlistsData.setlists ?? []));
      localStorage.setItem(getBandCacheKey("events", targetBandId), JSON.stringify(eventsData.events ?? []));
      localStorage.setItem(getBandCacheKey("albums", targetBandId), JSON.stringify(albumsData.albums ?? []));

      setSelectedSongId((prev) => {
        if (prev && nextSongs.some((song) => song.id === prev)) {
          return prev;
        }
        return nextSongs[0]?.id ?? null;
      });

      setSelectedSetlistId((prev) => {
        if (prev && nextSetlists.some((setlist) => setlist.id === prev)) {
          return prev;
        }
        return nextSetlists[0]?.id ?? null;
      });

      setSelectedAlbumId((prev) => {
        if (prev && nextAlbums.some((album) => album.id === prev)) {
          return prev;
        }
        return nextAlbums[0]?.id ?? null;
      });

      setStatusMessage("Daten geladen.");
      window.localStorage.setItem("bandival.bandId", targetBandId);
    } catch (error) {
      const cachedSongs = localStorage.getItem(getBandCacheKey("songs", targetBandId));
      const cachedSetlists = localStorage.getItem(getBandCacheKey("setlists", targetBandId));
      const cachedEvents = localStorage.getItem(getBandCacheKey("events", targetBandId));
      const cachedAlbums = localStorage.getItem(getBandCacheKey("albums", targetBandId));

      if (error instanceof TypeError && cachedSongs && cachedSetlists) {
        setSongs(
          (JSON.parse(cachedSongs) as Array<Partial<Song> & { id: string; title: string; updatedAt: string }>).map(
            normalizeSong,
          ),
        );
        setSetlists(JSON.parse(cachedSetlists));
        setEvents(cachedEvents ? JSON.parse(cachedEvents) : []);
        setAlbums(cachedAlbums ? JSON.parse(cachedAlbums) : []);
        setStatusMessage("Offline: lokale Daten geladen.");
      } else {
        setSongs([]);
        setSetlists([]);
        setEvents([]);
        setAlbums([]);
        setSelectedSongId(null);
        setSelectedSetlistId(null);
        setStatusMessage(error instanceof Error ? error.message : "Laden fehlgeschlagen.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [apiFetch, loadDayAvailabilities, normalizeSong, selectedCalendarMonth]);

  useEffect(() => {
    if (!bandId) {
      return;
    }
    void loadDayAvailabilities(bandId, selectedCalendarMonth);
  }, [bandId, loadDayAvailabilities, selectedCalendarMonth]);

  const {
    createInvite,
    resendInvite,
    copyInviteLink,
    extendInvite,
    acceptInviteToken,
    revokeInvite,
    bulkResendSelectedInvites,
  } = useInvitesController({
    apiFetch,
    bandId,
    inviteEmail,
    inviteTokenInput,
    selectedInviteIds,
    setInvites,
    setInviteEmail,
    setLastInviteLink,
    setInviteTokenInput,
    setBandId,
    setSelectedInviteIds,
    setStatusMessage,
    loadData,
  });

  const {
    loadRehearsal,
    saveRehearsalNote,
  } = useRehearsalController({
    apiFetch,
    selectedSetlistId,
    newTaskTitle,
    newTaskDueAt,
    setNewTaskTitle,
    setNewTaskDueAt,
    setRehearsalItems,
    setRehearsalNotes,
    setRehearsalTasks,
    setStatusMessage,
  });

  useEffect(() => {
    if (!selectedSetlistId) {
      setRehearsalItems([]);
      setRehearsalNotes({});
      return;
    }

    void loadRehearsal(selectedSetlistId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSetlistId]);

  const refreshSession = useCallback(async (preferredBandId?: string) => {
    const res = await apiFetch("/api/auth/me", { cache: "no-store" });
    if (!res.ok) {
      setAuthUser(null);
      setBandId("");
      router.replace("/");
      return;
    }

    const data = await res.json();
    const user = (data.user ?? null) as SessionUser | null;
    setAuthUser(user);

    const memberBandIds = user?.bandIds ?? [];
    const preferred = preferredBandId && memberBandIds.includes(preferredBandId) ? preferredBandId : undefined;
    const defaultBandId = user?.defaultBandId && memberBandIds.includes(user.defaultBandId) ? user.defaultBandId : undefined;
    const resolvedBandId = preferred ?? defaultBandId ?? memberBandIds[0] ?? "";

    if (preferredBandId && !preferred) {
      window.localStorage.removeItem("bandival.bandId");
    }

    if (!resolvedBandId) {
      setBandId("");
      setStatusMessage("Keine Band gefunden. Einladung annehmen oder neue Band erstellen.");
      return;
    }

    setBandId(resolvedBandId);
    await loadData(resolvedBandId);
  }, [apiFetch, loadData, router]);

  async function login() {
    try {
      const res = await apiFetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Login fehlgeschlagen.");
      }

      const user = (data.user ?? null) as SessionUser | null;
      setAuthUser(user);
      const memberBandIds = user?.bandIds ?? [];
      const nextBandId = user?.defaultBandId && memberBandIds.includes(user.defaultBandId)
        ? user.defaultBandId
        : (memberBandIds[0] ?? "");
      if (nextBandId) {
        setBandId(nextBandId);
        await loadData(nextBandId);
      }

      setStatusMessage(nextBandId ? "Session gestartet." : "Session gestartet. Keine Band zugeordnet.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Login fehlgeschlagen.");
    }
  }

  async function logout() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    setAuthUser(null);
    setBandId("");
    setSongs([]);
    setSetlists([]);
    setAlbums([]);
    setEvents([]);
    setStatusMessage("Abgemeldet.");
    router.replace("/");
  }

  const refreshSong = useCallback(async (songId: string) => {
    const response = await apiFetch(`/api/songs/${songId}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error ?? "Song konnte nicht geladen werden.");
    }

    const nextSong = normalizeSong(data.song as Song);
    setSongs((prev) => prev.map((s) => (s.id === nextSong.id ? nextSong : s)));
    setSelectedAlbumId(nextSong.albumId ?? null);

    const current = nextSong.audioVersions.find((audio) => audio.isCurrent);
    if (current) {
      setCurrentAudio({
        url: current.fileUrl,
        name: `${nextSong.title} - ${current.fileName}`,
        durationSeconds: nextSong.durationSeconds,
      });
    }
  }, [apiFetch, normalizeSong]);

  async function createSong() {
    if (!newSongTitle.trim()) {
      return;
    }

    try {
      const response = await apiFetch("/api/songs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bandId,
          title: newSongTitle.trim(),
          albumId: newSongAlbumId || null,
          keySignature: newSongKeySignature.trim() || null,
          tempoBpm: Number(newSongTempoBpm) > 0 ? Number(newSongTempoBpm) : null,
          durationSeconds: (Number(newSongDurationMinutes) > 0 || Number(newSongDurationSeconds) > 0)
            ? Math.max(0, Number(newSongDurationMinutes) || 0) * 60 + Math.max(0, Number(newSongDurationSeconds) || 0)
            : null,
          spotifyUrl: newSongSpotifyUrl.trim() || null,
          lyricsMarkdown: "",
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Song konnte nicht erstellt werden.");
      }

      setNewSongTitle("");
      setNewSongAlbumId("");
      setNewSongKeySignature("");
      setNewSongTempoBpm("");
      setNewSongDurationMinutes("");
      setNewSongDurationSeconds("");
      setNewSongSpotifyUrl("");
      setShowCreateSongModal(false);
      setSelectedSongId(data.song.id);
      await loadData(bandId);
      setStatusMessage("Song erstellt.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Song-Erstellung fehlgeschlagen.");
    }
  }

  async function updateSong(formData: FormData) {
    if (!selectedSong) {
      return;
    }

    const durationMinutes = Number(formData.get("durationMinutes") ?? 0) || 0;
    const durationRemainingSeconds = Number(formData.get("durationRestSeconds") ?? 0) || 0;
    const durationSeconds = durationMinutes * 60 + durationRemainingSeconds;
    const workflowStatus = (String(formData.get("workflowStatus") ?? "draft") as SongWorkflowStatus);
    const notesBody = String(formData.get("notes") ?? "");

    const payload = {
      title: String(formData.get("title") ?? ""),
      albumId: String(formData.get("albumId") ?? "") || null,
      albumTrackNo: Number(formData.get("albumTrackNo") ?? 0) || null,
      keySignature: String(formData.get("keySignature") ?? "") || null,
      tempoBpm: Number(formData.get("tempoBpm") ?? 0) || null,
      durationSeconds: durationSeconds > 0 ? durationSeconds : null,
      spotifyUrl: songSettingsSpotifyUrl.trim() || null,
      workflowStatus,
      notes: notesBody || null,
    };

    try {
      const response = await apiFetch(`/api/songs/${selectedSong.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Song konnte nicht gespeichert werden.");
      }

      await refreshSong(selectedSong.id);
      await loadData(bandId);
      setStatusMessage("Song gespeichert.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Song-Update fehlgeschlagen.");
    }
  }

  async function saveLeadSheetStudio() {
    if (!selectedSong) {
      return;
    }

    try {
      const response = await apiFetch(`/api/songs/${selectedSong.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chordProText: leadSheetDraftChordPro.trim() || null,
          lyricsMarkdown: leadSheetDraftLyrics.trim() || null,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Lead Sheet konnte nicht gespeichert werden.");
      }

      await refreshSong(selectedSong.id);
      setShowLeadSheetStudio(false);
      setSongTab("chords");
      setStatusMessage("Lead Sheet gespeichert.");
      setSuccessToast("Lead Sheet Studio gespeichert.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Lead Sheet speichern fehlgeschlagen.");
    }
  }

  function tapBpm() {
    const now = Date.now();
    setBpmTapHistory((prev) => {
      const next = [...prev, now].slice(-8);
      if (next.length >= 2) {
        const intervals = next.slice(1).map((value, index) => value - next[index]).filter((ms) => ms > 0);
        const avgMs = intervals.reduce((sum, ms) => sum + ms, 0) / intervals.length;
        const bpm = Math.round(60000 / avgMs);
        if (Number.isFinite(bpm)) {
          setBpmTapValue(String(bpm));
        }
      }
      return next;
    });
  }

  function enqueueAudioFiles(files: File[]) {
    const queueItems: UploadQueueItem[] = files.map((file) => {
      const validationError = validateUploadFile(file, "audio") ?? undefined;
      return {
        id: generateClientId(),
        file,
        progress: 0,
        status: validationError ? "error" : "queued",
        error: validationError,
      };
    });
    setAudioUploadQueue((prev) => [...prev, ...queueItems]);
  }

  function enqueueAttachmentFiles(files: File[], kind: string) {
    const queueItems: UploadQueueItem[] = files.map((file) => {
      const validationError = validateUploadFile(file, "attachment") ?? undefined;
      return {
        id: generateClientId(),
        file,
        kind,
        progress: 0,
        status: validationError ? "error" : "queued",
        error: validationError,
      };
    });
    setAttachmentUploadQueue((prev) => [...prev, ...queueItems]);
  }

  function cancelCurrentAudioUpload() {
    audioCancelRef.current?.();
  }

  function cancelCurrentAttachmentUpload() {
    attachmentCancelRef.current?.();
  }

  const loadSetlistBoardTasks = useCallback(async (targetSetlistId: string) => {
    if (!bandId) {
      return;
    }
    const response = await apiFetch(`/api/boards/tasks?bandId=${bandId}&setlistId=${targetSetlistId}`);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error ?? "Setlist Board konnte nicht geladen werden.");
    }
    setSetlistBoardTasks((prev) => ({ ...prev, [targetSetlistId]: data.tasks ?? [] }));
  }, [apiFetch, bandId]);

  const loadSongBoardTasks = useCallback(async (targetSongId: string) => {
    if (!bandId) {
      return;
    }
    const response = await apiFetch(`/api/boards/tasks?bandId=${bandId}&songId=${targetSongId}`);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error ?? "Song Board konnte nicht geladen werden.");
    }
    setSongBoardTasks((prev) => ({ ...prev, [targetSongId]: data.tasks ?? [] }));
  }, [apiFetch, bandId]);

  useEffect(() => {
    if (!selectedSetlistId) {
      return;
    }
    void loadSetlistBoardTasks(selectedSetlistId);
  }, [loadSetlistBoardTasks, selectedSetlistId]);

  useEffect(() => {
    if (!selectedSongId) {
      return;
    }
    void loadSongBoardTasks(selectedSongId);
  }, [loadSongBoardTasks, selectedSongId]);

  async function addSetlistBoardTask() {
    if (!bandId || !selectedSetlistId || !newSetlistBoardTaskTitle.trim()) {
      return;
    }
    try {
      const response = await apiFetch("/api/boards/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bandId, setlistId: selectedSetlistId, title: newSetlistBoardTaskTitle.trim() }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Setlist Task konnte nicht erstellt werden.");
      }
      setSetlistBoardTasks((prev) => ({ ...prev, [selectedSetlistId]: [data.task, ...(prev[selectedSetlistId] ?? [])] }));
      setNewSetlistBoardTaskTitle("");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Setlist Task fehlgeschlagen.");
    }
  }

  async function addSongBoardTask() {
    if (!bandId || !selectedSongId || !newSongBoardTaskTitle.trim()) {
      return;
    }
    try {
      const response = await apiFetch("/api/boards/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bandId, songId: selectedSongId, title: newSongBoardTaskTitle.trim() }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Song Task konnte nicht erstellt werden.");
      }
      setSongBoardTasks((prev) => ({ ...prev, [selectedSongId]: [data.task, ...(prev[selectedSongId] ?? [])] }));
      setNewSongBoardTaskTitle("");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Song Task fehlgeschlagen.");
    }
  }

  async function moveSetlistBoardTask(taskId: string, status: BoardTaskStatus) {
    if (!selectedSetlistId) {
      return;
    }
    try {
      const response = await apiFetch("/api/boards/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, status }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Setlist Task konnte nicht aktualisiert werden.");
      }
      setSetlistBoardTasks((prev) => ({
        ...prev,
        [selectedSetlistId]: (prev[selectedSetlistId] ?? []).map((task) => task.id === taskId ? data.task : task),
      }));
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Setlist Task-Update fehlgeschlagen.");
    }
  }

  async function moveSongBoardTask(taskId: string, status: BoardTaskStatus) {
    if (!selectedSongId) {
      return;
    }
    try {
      const response = await apiFetch("/api/boards/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, status }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Song Task konnte nicht aktualisiert werden.");
      }
      setSongBoardTasks((prev) => ({
        ...prev,
        [selectedSongId]: (prev[selectedSongId] ?? []).map((task) => task.id === taskId ? data.task : task),
      }));
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Song Task-Update fehlgeschlagen.");
    }
  }

  async function deleteSetlistBoardTask(taskId: string) {
    if (!selectedSetlistId) {
      return;
    }
    try {
      const response = await apiFetch(`/api/boards/tasks?taskId=${taskId}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Setlist Task konnte nicht geloescht werden.");
      }
      setSetlistBoardTasks((prev) => ({
        ...prev,
        [selectedSetlistId]: (prev[selectedSetlistId] ?? []).filter((task) => task.id !== taskId),
      }));
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Setlist Task-Loeschen fehlgeschlagen.");
    }
  }

  async function deleteSongBoardTask(taskId: string) {
    if (!selectedSongId) {
      return;
    }
    try {
      const response = await apiFetch(`/api/boards/tasks?taskId=${taskId}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Song Task konnte nicht geloescht werden.");
      }
      setSongBoardTasks((prev) => ({
        ...prev,
        [selectedSongId]: (prev[selectedSongId] ?? []).filter((task) => task.id !== taskId),
      }));
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Song Task-Loeschen fehlgeschlagen.");
    }
  }

  function retryAudioQueueItem(itemId: string) {
    setAudioUploadQueue((prev) => prev.map((item) => {
      if (item.id !== itemId) {
        return item;
      }
      return {
        ...item,
        status: "queued",
        progress: 0,
        error: undefined,
      };
    }));
  }

  function retryAttachmentQueueItem(itemId: string) {
    setAttachmentUploadQueue((prev) => prev.map((item) => {
      if (item.id !== itemId) {
        return item;
      }
      return {
        ...item,
        status: "queued",
        progress: 0,
        error: undefined,
      };
    }));
  }

  function removeAudioQueueItem(itemId: string) {
    setAudioUploadQueue((prev) => prev.filter((item) => item.id !== itemId));
  }

  function removeAttachmentQueueItem(itemId: string) {
    setAttachmentUploadQueue((prev) => prev.filter((item) => item.id !== itemId));
  }

  async function renameAttachmentQuick(attachmentId: string, nextName: string) {
    if (!selectedSong) {
      return;
    }

    const response = await apiFetch(`/api/songs/${selectedSong.id}/attachments/${attachmentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: nextName }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error ?? "Dateiname konnte nicht aktualisiert werden.");
    }
    await refreshSong(selectedSong.id);
  }

  async function renameAudioQuick(audioId: string, nextName: string) {
    if (!selectedSong) {
      return;
    }

    const response = await apiFetch(`/api/songs/${selectedSong.id}/audio/${audioId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: nextName }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error ?? "Audio-Name konnte nicht aktualisiert werden.");
    }
    await refreshSong(selectedSong.id);
  }

  async function markAudioCurrentQuick(audioId: string) {
    if (!selectedSong) {
      return;
    }

    const response = await apiFetch(`/api/songs/${selectedSong.id}/audio/${audioId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isCurrent: true }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error ?? "Audio konnte nicht als aktuell markiert werden.");
    }
    await refreshSong(selectedSong.id);
  }

  async function postUploadToDiscussion(upload: UploadSuccessCard) {
    if (!selectedSong) {
      return;
    }

    const response = await apiFetch(`/api/songs/${selectedSong.id}/threads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `Neuer Upload: ${upload.fileName}`,
        body: `${upload.kindLabel} wurde hochgeladen: ${upload.fileUrl}`,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error ?? "Diskussionsbeitrag konnte nicht erstellt werden.");
    }

    await refreshSong(selectedSong.id);
    setSongTab("discussion");
    setStatusMessage("Upload in Diskussion gepostet.");
  }

  const processNextAudioUpload = useCallback(async () => {
    if (!selectedSong || isUploadingAudio) {
      return;
    }

    const next = audioUploadQueue.find((item) => item.status === "queued" && !item.error);
    if (!next) {
      return;
    }

    setIsUploadingAudio(true);
    setAudioUploadProgress(0);
    setCurrentAudioUploadName(next.file.name);
    setAudioUploadQueue((prev) => prev.map((item) => item.id === next.id ? { ...item, status: "uploading" } : item));

    const formData = new FormData();
    formData.append("file", next.file);
    const request = uploadWithProgress(`/api/songs/${selectedSong.id}/audio`, formData, (value) => {
      setAudioUploadProgress(value);
      setAudioUploadQueue((prev) => prev.map((item) => item.id === next.id ? { ...item, progress: value } : item));
    });

    audioCancelRef.current = request.cancel;

    try {
      const result = await request.promise;
      if (!result.ok) {
        throw new Error(result.data.error ?? "Audio-Upload fehlgeschlagen.");
      }

      const uploaded = result.data.audioVersion as SongAudio | undefined;
      setAudioUploadQueue((prev) => prev.map((item) => item.id === next.id
        ? { ...item, status: "done", progress: 100, uploadedId: uploaded?.id, uploadedUrl: uploaded?.fileUrl, uploadedName: uploaded?.fileName }
        : item));
      if (uploaded) {
        setLastUploadSuccess({
          id: uploaded.id,
          fileName: uploaded.fileName,
          fileUrl: uploaded.fileUrl,
          kindLabel: "Audio",
          isAudio: true,
        });
      }
      await refreshSong(selectedSong.id);
      setStatusMessage(`Audio hochgeladen: ${next.file.name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Audio-Upload fehlgeschlagen.";
      setAudioUploadQueue((prev) => prev.map((item) => item.id === next.id ? {
        ...item,
        status: message.includes("abgebrochen") ? "canceled" : "error",
        error: message,
      } : item));
      setStatusMessage(message);
    } finally {
      audioCancelRef.current = null;
      setIsUploadingAudio(false);
      setCurrentAudioUploadName("");
      window.setTimeout(() => setAudioUploadProgress(null), 900);
    }
  }, [audioUploadQueue, isUploadingAudio, refreshSong, selectedSong, uploadWithProgress]);

  const processNextAttachmentUpload = useCallback(async () => {
    if (!selectedSong || isUploadingAttachment) {
      return;
    }

    const next = attachmentUploadQueue.find((item) => item.status === "queued" && !item.error);
    if (!next) {
      return;
    }

    setIsUploadingAttachment(true);
    setAttachmentUploadProgress(0);
    setCurrentAttachmentUploadName(next.file.name);
    setAttachmentUploadQueue((prev) => prev.map((item) => item.id === next.id ? { ...item, status: "uploading" } : item));

    const formData = new FormData();
    formData.append("file", next.file);
    formData.append("kind", next.kind ?? "other");
    const request = uploadWithProgress(`/api/songs/${selectedSong.id}/attachments`, formData, (value) => {
      setAttachmentUploadProgress(value);
      setAttachmentUploadQueue((prev) => prev.map((item) => item.id === next.id ? { ...item, progress: value } : item));
    });

    attachmentCancelRef.current = request.cancel;

    try {
      const result = await request.promise;
      if (!result.ok) {
        throw new Error(result.data.error ?? "Datei-Upload fehlgeschlagen.");
      }

      const uploaded = result.data.attachment as SongAttachment | undefined;
      setAttachmentUploadQueue((prev) => prev.map((item) => item.id === next.id
        ? { ...item, status: "done", progress: 100, uploadedId: uploaded?.id, uploadedUrl: uploaded?.fileUrl, uploadedName: uploaded?.fileName }
        : item));
      if (uploaded) {
        setLastUploadSuccess({
          id: uploaded.id,
          fileName: uploaded.fileName,
          fileUrl: uploaded.fileUrl,
          kindLabel: next.kind ?? "Datei",
          isAudio: false,
        });
      }
      await refreshSong(selectedSong.id);
      setStatusMessage(`Datei hochgeladen: ${next.file.name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Datei-Upload fehlgeschlagen.";
      setAttachmentUploadQueue((prev) => prev.map((item) => item.id === next.id ? {
        ...item,
        status: message.includes("abgebrochen") ? "canceled" : "error",
        error: message,
      } : item));
      setStatusMessage(message);
    } finally {
      attachmentCancelRef.current = null;
      setIsUploadingAttachment(false);
      setCurrentAttachmentUploadName("");
      window.setTimeout(() => setAttachmentUploadProgress(null), 900);
    }
  }, [attachmentUploadQueue, isUploadingAttachment, refreshSong, selectedSong, uploadWithProgress]);

  useEffect(() => {
    if (!isUploadingAudio) {
      void processNextAudioUpload();
    }
  }, [audioUploadQueue, isUploadingAudio, processNextAudioUpload]);

  useEffect(() => {
    if (!isUploadingAttachment) {
      void processNextAttachmentUpload();
    }
  }, [attachmentUploadQueue, isUploadingAttachment, processNextAttachmentUpload]);

  async function createSetlist() {
    if (!newSetlistName.trim()) {
      return;
    }

    try {
      const response = await apiFetch("/api/setlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bandId,
          name: newSetlistName.trim(),
          description: newSetlistDescription.trim() || null,
          songIds: newSetlistSongIds.length > 0 ? newSetlistSongIds : (selectedSong ? [selectedSong.id] : []),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Setlist konnte nicht erstellt werden.");
      }

      setNewSetlistName("");
      setNewSetlistDescription("");
      setNewSetlistSongIds([]);
      setShowCreateSetlistModal(false);
      await loadData(bandId);
      setStatusMessage("Setlist erstellt.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Setlist-Erstellung fehlgeschlagen.");
    }
  }

  async function copySetlist(setlistId: string) {
    try {
      const response = await apiFetch(`/api/setlists/${setlistId}/copy`, {
        method: "POST",
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Setlist konnte nicht kopiert werden.");
      }

      await loadData(bandId);
      setStatusMessage("Setlist kopiert.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Setlist-Kopie fehlgeschlagen.");
    }
  }

  async function saveSetlistEditorSongs() {
    if (!selectedSetlist) {
      return;
    }

    try {
      const response = await apiFetch(`/api/setlists/${selectedSetlist.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songIds: setlistEditorSongIds }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Setlist Songs konnten nicht gespeichert werden.");
      }

      setSetlists((prev) => prev.map((setlist) => (setlist.id === selectedSetlist.id ? data.setlist : setlist)));
      setStatusMessage("Setlist Songs aktualisiert.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Setlist-Editor fehlgeschlagen.");
    }
  }

  function addSetlistInstrument() {
    const value = setlistInstrumentInput.trim();
    if (!value) {
      return;
    }
    setSetlistInstrumentsDraft((prev) => normalizeTagList([...prev, value]));
    setSetlistInstrumentInput("");
  }

  function removeSetlistInstrument(value: string) {
    setSetlistInstrumentsDraft((prev) => prev.filter((item) => item !== value));
  }

  function addSetlistEquipment() {
    const value = setlistEquipmentInput.trim();
    if (!value) {
      return;
    }
    setSetlistEquipmentDraft((prev) => normalizeTagList([...prev, value]));
    setSetlistEquipmentInput("");
  }

  function removeSetlistEquipment(value: string) {
    setSetlistEquipmentDraft((prev) => prev.filter((item) => item !== value));
  }

  async function saveSetlistDetails() {
    if (!selectedSetlist) {
      return;
    }

    try {
      const response = await apiFetch(`/api/setlists/${selectedSetlist.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: encodeSetlistDescription(setlistDescriptionDraft, {
            instruments: setlistInstrumentsDraft,
            equipment: setlistEquipmentDraft,
          }),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Setlist-Details konnten nicht gespeichert werden.");
      }

      setSetlists((prev) => prev.map((setlist) => (setlist.id === selectedSetlist.id ? data.setlist : setlist)));
      setStatusMessage("Setlist-Details gespeichert.");
      setSuccessToast("Instrumente und Equipment gespeichert.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Setlist-Details speichern fehlgeschlagen.");
    }
  }

  async function deleteSong(songId: string) {
    if (!window.confirm("Song wirklich loeschen?")) {
      return;
    }

    try {
      const response = await apiFetch(`/api/songs/${songId}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Song konnte nicht geloescht werden.");
      }
      await loadData(bandId);
      setStatusMessage("Song geloescht.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Song loeschen fehlgeschlagen.");
    }
  }

  async function deleteSetlist(setlistId: string) {
    if (!window.confirm("Setlist wirklich loeschen?")) {
      return;
    }

    try {
      const response = await apiFetch(`/api/setlists/${setlistId}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Setlist konnte nicht geloescht werden.");
      }
      setSelectedSetlistId((prev) => (prev === setlistId ? null : prev));
      await loadData(bandId);
      setStatusMessage("Setlist geloescht.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Setlist loeschen fehlgeschlagen.");
    }
  }

  async function deleteAlbum(albumId: string) {
    if (!window.confirm("Album wirklich loeschen?")) {
      return;
    }

    try {
      const response = await apiFetch(`/api/albums/${albumId}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Album konnte nicht geloescht werden.");
      }
      setSelectedAlbumId((prev) => (prev === albumId ? null : prev));
      await loadData(bandId);
      setStatusMessage("Album geloescht.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Album loeschen fehlgeschlagen.");
    }
  }

  async function createThread(event: FormEvent) {
    event.preventDefault();

    if (!selectedSong || !threadTitle.trim() || !threadBody.trim()) {
      return;
    }

    try {
      const response = await apiFetch(`/api/songs/${selectedSong.id}/threads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: threadTitle.trim(),
          body: threadBody.trim(),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Thread konnte nicht erstellt werden.");
      }

      setThreadTitle("");
      setThreadBody("");
      await refreshSong(selectedSong.id);
      setStatusMessage("Diskussion erstellt.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Thread-Erstellung fehlgeschlagen.");
    }
  }

  async function addPost(threadId: string, body: string) {
    if (!selectedSong || !body.trim()) {
      return;
    }

    try {
      const response = await apiFetch(`/api/threads/${threadId}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: body.trim() }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Antwort konnte nicht erstellt werden.");
      }

      await refreshSong(selectedSong.id);
      setStatusMessage("Antwort gespeichert.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Antwort fehlgeschlagen.");
    }
  }

  async function createAlbum() {
    if (!newAlbumTitle.trim()) {
      return;
    }

    const response = await apiFetch("/api/albums", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bandId, title: newAlbumTitle.trim() }),
    });
    const data = await response.json();
    if (!response.ok) {
      setStatusMessage(data.error ?? "Album konnte nicht erstellt werden.");
      return;
    }

    setAlbums((prev) => [data.album, ...prev]);
    setSelectedAlbumId(data.album.id);
    setNewAlbumTitle("");
    setShowCreateAlbumModal(false);
  }

  async function exportSetlistPdf(setlistId: string) {
    const response = await apiFetch(`/api/setlists/${setlistId}/pdf`, { method: "POST" });
    const data = await response.json();
    if (!response.ok) {
      setStatusMessage(data.error ?? "PDF-Export fehlgeschlagen.");
      return;
    }

    const pdfUrl = data?.setlist?.pdfExportUrl as string | null | undefined;
    if (pdfUrl) {
      window.open(pdfUrl, "_blank", "noopener,noreferrer");
    }
    await loadData(bandId);
    setStatusMessage("Setlist als PDF exportiert.");
  }

  async function reorderSetlist(setlistId: string, orderedItemIds: string[]) {
    setSetlists((prev) =>
      prev.map((setlist) => {
        if (setlist.id !== setlistId) {
          return setlist;
        }

        const byId = new Map(setlist.items.map((item) => [item.id, item]));
        return {
          ...setlist,
          items: orderedItemIds
            .map((id, index) => {
              const existing = byId.get(id);
              if (!existing) {
                return null;
              }

              return { ...existing, position: index + 1 };
            })
            .filter((item): item is SetlistItem => item !== null),
        };
      }),
    );

    if (!navigator.onLine) {
      queueOfflineAction({ kind: "setlist-reorder", setlistId, orderedItemIds });
      setStatusMessage("Offline: Reihenfolge lokal gespeichert.");
      return;
    }

    const response = await apiFetch(`/api/setlists/${setlistId}/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedItemIds }),
    });
    const data = await response.json();
    if (!response.ok) {
      setStatusMessage(data.error ?? "Reihenfolge konnte nicht gespeichert werden.");
      return;
    }

    setSetlists((prev) => prev.map((item) => (item.id === setlistId ? data.setlist : item)));
    setStatusMessage("Setlist-Reihenfolge aktualisiert.");
  }

  async function uploadAlbumCover(albumId: string, formData: FormData) {
    const response = await apiFetch(`/api/albums/${albumId}/cover`, {
      method: "POST",
      body: formData,
    });

    const data = await response.json();
    if (!response.ok) {
      setStatusMessage(data.error ?? "Albumcover Upload fehlgeschlagen.");
      return;
    }

    setAlbums((prev) => prev.map((album) => (album.id === albumId ? { ...album, ...data.album } : album)));
    setStatusMessage("Albumcover aktualisiert.");
  }

  async function reorderAlbumTracks(albumId: string, orderedSongIds: string[]) {
    const response = await apiFetch(`/api/albums/${albumId}/tracks`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedSongIds }),
    });
    const data = await response.json();

    if (!response.ok) {
      setStatusMessage(data.error ?? "Album Track-Reihenfolge fehlgeschlagen.");
      return;
    }

    setAlbums((prev) => prev.map((album) => (album.id === albumId ? data.album : album)));
    setSongs((prev) =>
      prev.map((song) => {
        const idx = orderedSongIds.indexOf(song.id);
        if (idx === -1) {
          return song;
        }
        return { ...song, albumId, albumTrackNo: idx + 1 };
      }),
    );
    setStatusMessage("Album Tracks aktualisiert.");
  }

  async function onSetlistDragEnd(result: DropResult) {
    if (!selectedSetlist || !result.destination || !isEditMode) {
      return;
    }

    const items = [...selectedSetlist.items];
    const [moved] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, moved);
    const orderedIds = items.map((item) => item.id);
    await reorderSetlist(selectedSetlist.id, orderedIds);
  }

  async function onAlbumDragEnd(result: DropResult) {
    if (!selectedAlbum || !result.destination || !isEditMode || !selectedAlbum.songs?.length) {
      return;
    }

    const songsToOrder = [...selectedAlbum.songs];
    const [moved] = songsToOrder.splice(result.source.index, 1);
    songsToOrder.splice(result.destination.index, 0, moved);
    await reorderAlbumTracks(
      selectedAlbum.id,
      songsToOrder.map((song) => song.id),
    );
  }

  async function createEvent(payloadOverride?: {
    title: string;
    startsAt: string;
    recurrenceEveryDays: number | null;
    recurrenceCount: number | null;
    venueLabel: string | null;
  }) {
    const eventTitle = payloadOverride?.title ?? newEventTitle.trim();
    const startsAtRaw = payloadOverride?.startsAt ?? newEventStartsAt;
    if (!eventTitle.trim() || !startsAtRaw) {
      return;
    }

    try {
      const recurrenceEveryDays = payloadOverride?.recurrenceEveryDays ?? Number(newEventRecurrenceEveryDays);
      const recurrenceCount = payloadOverride?.recurrenceCount ?? Number(newEventRecurrenceCount);

      const res = await apiFetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bandId,
          title: eventTitle.trim(),
          startsAt: new Date(startsAtRaw).toISOString(),
          venueLabel: payloadOverride?.venueLabel ?? (newEventVenueLabel.trim() || null),
          recurrenceEveryDays: Number.isFinite(recurrenceEveryDays) && recurrenceEveryDays > 0 ? recurrenceEveryDays : null,
          recurrenceCount: Number.isFinite(recurrenceCount) && recurrenceCount > 1 ? recurrenceCount : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Termin konnte nicht erstellt werden.");
      }

      setNewEventTitle("");
      setNewEventStartsAt("");
      setNewEventVenueLabel("");
      setNewEventRecurrenceEveryDays("");
      setNewEventRecurrenceCount("");
      await loadData(bandId);
      const createdCount = Array.isArray(data.events) ? data.events.length : 1;
      setStatusMessage(createdCount > 1 ? `${createdCount} Serientermine erstellt.` : "Termin erstellt.");
      setSuccessToast(createdCount > 1 ? `${createdCount} Termine wurden in Serie angelegt.` : "Termin erfolgreich angelegt.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Termin-Erstellung fehlgeschlagen.");
    }
  }

  async function markAllNotificationsRead() {
    try {
      const res = await apiFetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllRead: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Notifications konnten nicht aktualisiert werden.");
      }

      setNotifications((prev) => prev.map((n) => ({ ...n, readAt: new Date().toISOString() })));
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Notifications update fehlgeschlagen.");
    }
  }

  function openNotificationTarget(notification: AppNotification) {
    const payload = notification.payload ?? {};
    if (payload.songId) {
      setActiveSidebar("songs");
      setSelectedSongId(payload.songId);
      void refreshSong(payload.songId);
      if (view === "calendar") {
        router.push("/app/songs");
      }
      return;
    }

    if (payload.setlistId) {
      setActiveSidebar("setlists");
      setSelectedSetlistId(payload.setlistId);
      if (view === "calendar") {
        router.push("/app/setlists");
      }
      return;
    }

    if (payload.eventId && view !== "calendar") {
      router.push("/app/calendar");
    }
  }

  async function updateAvailability(eventId: string, status: "available" | "maybe" | "unavailable") {
    try {
      const res = await apiFetch(`/api/events/${eventId}/availability`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Verfuegbarkeit konnte nicht gespeichert werden.");
      }

      setEvents((prev) =>
        prev.map((event) =>
          event.id === eventId
            ? {
                ...event,
                myAvailability: {
                  status: data.availability.status,
                  note: data.availability.note,
                },
              }
            : event,
        ),
      );

      await loadData(bandId);
      setStatusMessage("Verfuegbarkeit aktualisiert.");
      setSuccessToast("Event-Verfuegbarkeit gespeichert.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Verfuegbarkeit fehlgeschlagen.");
    }
  }

  async function saveMusicXmlDraft() {
    if (!selectedSong || !musicXmlDraft.trim()) {
      return;
    }

    const file = new File([musicXmlDraft], `${selectedSong.title}-score.musicxml`, {
      type: "application/vnd.recordare.musicxml+xml",
    });
    enqueueAttachmentFiles([file], "score_musicxml");
    setMusicXmlDraft("");
  }

  return (
    <div className={isStageMode ? "dashboard-shell stage-mode" : "dashboard-shell"}>
      {isStageMode ? (
        <button type="button" className="stage-exit" onClick={() => setIsStageMode(false)}>
          Stage verlassen
        </button>
      ) : null}

      {errorToast ? (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            position: "fixed",
            top: "1rem",
            right: "1rem",
            zIndex: 1000,
            maxWidth: "26rem",
            background: "#991b1b",
            color: "#fff",
            padding: "0.75rem 0.9rem",
            borderRadius: "0.7rem",
            boxShadow: "0 8px 20px rgba(0,0,0,0.25)",
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
          }}
        >
          <span style={{ flex: 1 }}>{errorToast}</span>
          <button
            type="button"
            onClick={() => setErrorToast(null)}
            style={{
              border: "1px solid rgba(255,255,255,0.5)",
              background: "transparent",
              color: "#fff",
              borderRadius: "0.45rem",
              padding: "0.2rem 0.45rem",
              cursor: "pointer",
            }}
            aria-label="Fehlermeldung schliessen"
          >
            x
          </button>
        </div>
      ) : null}

      {successToast ? (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed",
            top: "1rem",
            right: "1rem",
            zIndex: 999,
            maxWidth: "26rem",
            background: "#166534",
            color: "#fff",
            padding: "0.75rem 0.9rem",
            borderRadius: "0.7rem",
            boxShadow: "0 8px 20px rgba(0,0,0,0.25)",
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
          }}
        >
          <span style={{ flex: 1 }}>{successToast}</span>
          <button
            type="button"
            onClick={() => setSuccessToast(null)}
            style={{
              border: "1px solid rgba(255,255,255,0.5)",
              background: "transparent",
              color: "#fff",
              borderRadius: "0.45rem",
              padding: "0.2rem 0.45rem",
              cursor: "pointer",
            }}
            aria-label="Erfolgsmeldung schliessen"
          >
            x
          </button>
        </div>
      ) : null}

      <header className="dashboard-header shell-header">
        <div className="header-brand-block">
          <div style={{ display: "flex", alignItems: "center", gap: "0.8rem" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/bandival_logo.svg" alt="Bandival Logo" width={52} height={52} />
            <div>
              <h1>{bandName}</h1>
              <p>Bandmanagement fuer Songs, Setlists, Termine und Austausch</p>
            </div>
          </div>
        </div>
        <div className="header-actions">
          <div className="band-context">
            <div className="search-autocomplete">
              <input
                value={searchQuery}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => window.setTimeout(() => setIsSearchFocused(false), 120)}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Suche Songs, Setlists, Alben"
                aria-label="Suche"
              />
              {isSearchFocused && searchSuggestions.length > 0 ? (
                <ul className="search-suggest-list">
                  {searchSuggestions.map((item) => (
                    <li key={`${item.kind}-${item.id}`}>
                      <button type="button" className="ghost" onClick={() => selectSearchSuggestion(item)}>
                        <strong>{item.title}</strong>
                        <span>{item.subtitle}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            {searchQuery ? (
              <button type="button" className="ghost" onClick={() => setSearchQuery("")}>Suche leeren</button>
            ) : null}
            <button type="button" className="ghost icon-btn" onClick={() => void loadData(bandId)} disabled={!bandId} aria-label="Neu laden" title="Neu laden">
              ↻
            </button>
            <button type="button" className="ghost icon-btn" onClick={() => router.push("/app/calendar")} aria-label="Kalender" title="Kalender">
              ◷
            </button>
            <button type="button" className="ghost icon-btn" onClick={() => router.push("/app/activity")} aria-label="Aktivitaeten" title="Aktivitaeten">
              ☰
            </button>
            <button
              type="button"
              className="ghost icon-btn"
              onClick={cycleTheme}
              aria-label={`Theme wechseln (aktuell: ${currentThemeLabel})`}
              aria-keyshortcuts="Control+Shift+L"
              title={`Theme: ${currentThemeLabel} (Ctrl+Shift+L)`}
            >
              {themeMode === "dark" ? "◐" : themeMode === "light" ? "◑" : "◍"}
            </button>
            <button type="button" className={unreadNotificationCount > 0 ? "notif-btn has-unread icon-btn" : "notif-btn icon-btn"} onClick={() => setShowNotifications((prev) => !prev)} aria-label="Benachrichtigungen" title={`Benachrichtigungen${unreadNotificationCount > 0 ? ` (${unreadNotificationCount})` : ""}`}>
              ◉
              {unreadNotificationCount > 0 ? <span className="notif-inline">{unreadNotificationCount}</span> : null}
            </button>
            <button type="button" className="ghost icon-btn" onClick={() => (window.location.href = "/app/settings")} aria-label="Einstellungen" title="Einstellungen">
              ◎
            </button>
            {authUser ? (
              <button type="button" className="ghost icon-btn" onClick={() => void logout()} aria-label={`Abmelden (${authUser.email})`} title={`Abmelden (${authUser.email})`}>
                ⎋
              </button>
            ) : (
              <>
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(event) => setLoginEmail(event.target.value)}
                  placeholder="email"
                  aria-label="Email"
                  autoComplete="username"
                />
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.target.value)}
                  placeholder="passwort"
                  aria-label="Passwort"
                  autoComplete="current-password"
                />
                <button type="button" onClick={() => void login()}>
                  Login
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {showNotifications ? (
        <section className="box shell-header">
          <div className="thread-form" style={{ marginBottom: "0.6rem" }}>
            <button type="button" onClick={() => void markAllNotificationsRead()}>
              Alle als gelesen markieren
            </button>
          </div>
          <ul className="attachment-list">
            {notifications.slice(0, 8).map((notification) => (
              <li key={notification.id}>
                <button type="button" className="ghost" onClick={() => openNotificationTarget(notification)}>
                  {new Date(notification.createdAt).toLocaleString("de-DE")} - {notification.title}: {notification.body}
                </button>
                <span>{notification.readAt ? "gelesen" : "neu"}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="dashboard-hero shell-header">
        <article className="hero-stat">
          <h4>Songs</h4>
          <strong>{songs.length}</strong>
          <span>inkl. Drafts und Repertoire</span>
        </article>
        <article className="hero-stat">
          <h4>Setlists</h4>
          <strong>{setlists.length}</strong>
          <span>Show-fertig und rehearsal-ready</span>
        </article>
        <article className="hero-stat">
          <h4>Notifications</h4>
          <strong>{unreadNotificationCount}</strong>
          <span>ungelesen</span>
        </article>
        <article className="hero-stat">
          <h4>Naechster Termin</h4>
          <strong>{nextEvent ? `${new Date(nextEvent.startsAt).toLocaleDateString("de-DE")} · ${nextEvent.title}` : "-"}</strong>
          <span>{nextEvent?.venueLabel ?? "kein kommender Termin"}</span>
        </article>
      </section>

      <div className="dashboard-body">
        <aside className="sidebar shell-sidebar">
          <div className="sidebar-switch">
            <button
              type="button"
              className={activeSidebar === "songs" ? "active" : ""}
              onClick={() => setActiveSidebar("songs")}
            >
              Songs
            </button>
            <button
              type="button"
              className={activeSidebar === "setlists" ? "active" : ""}
              onClick={() => setActiveSidebar("setlists")}
            >
              Setlists
            </button>
          </div>

          <div className="sidebar-legend" aria-label="Panel-Hinweis">
            <strong>Navigation</strong>
            <p>Tab-Panels: Songs und Setlists (oben umschalten).</p>
            <p>Immer sichtbar: Statuszeile, Player und Workspace-Meldungen.</p>
          </div>

          {activeSidebar === "songs" ? (
            <SongsPanel
              albums={albums}
              filteredSongs={filteredSongs}
              selectedAlbumId={selectedAlbumId}
              selectedSongId={selectedSongId}
              canCreateSongs={can("songs.create")}
              searchQuery={searchQuery}
              onOpenCreateSong={() => setShowCreateSongModal(true)}
              onOpenCreateAlbum={() => setShowCreateAlbumModal(true)}
              onSelectAlbum={setSelectedAlbumId}
              onSelectSong={(songId) => {
                setSelectedSongId(songId);
                void refreshSong(songId);
                if (view === "calendar") {
                  router.push("/app/songs");
                }
              }}
            />
          ) : (
            <SetlistsPanel
              filteredSetlists={filteredSetlists}
              canCreateSetlists={can("setlists.create")}
              isStageMode={isStageMode}
              searchQuery={searchQuery}
              onOpenCreateSetlist={() => setShowCreateSetlistModal(true)}
              onSelectSetlist={setSelectedSetlistId}
              onOpenSetlistPage={(setlistId) => router.push(`/app/setlists/${setlistId}`)}
              onCopySetlist={(setlistId) => void copySetlist(setlistId)}
              onDeleteSetlist={(setlistId) => void deleteSetlist(setlistId)}
              onSelectSetlistSong={(songId) => {
                setActiveSidebar("songs");
                setSelectedSongId(songId);
                void refreshSong(songId);
                if (view === "calendar" || view === "setlists") {
                  router.push("/app/songs");
                }
              }}
              onExportPdf={(setlistId) => void exportSetlistPdf(setlistId)}
              onToggleStage={() => setIsStageMode((prev) => !prev)}
            />
          )}
        </aside>

        <main className="main-content" ref={mainContentRef}>
          {isStageMode ? (
            <section className="stage-hud">
              <span>{isAutoScroll ? "Auto-Scroll aktiv" : "Auto-Scroll pausiert"}</span>
              <span>Speed: {autoScrollSpeed.toFixed(2)}</span>
              <span>Hotkeys: Space/Enter, Arrow Up/Down, PgUp/PgDn</span>
            </section>
          ) : null}

          <div className="status-row">
            <span>
              {isLoading ? "Lade ..." : statusMessage}
              {bandId ? ` | Band: ${bandId.slice(0, 8)}...` : ""}
            </span>
          </div>

          {isLoading ? (
            <section className="box skeleton-panel" aria-hidden="true">
              <div className="skeleton-line lg" />
              <div className="skeleton-line" />
              <div className="skeleton-line" />
              <div className="skeleton-line sm" />
            </section>
          ) : null}

          {!isLoading ? (
            <section className="workspace-state-strip" aria-live="polite">
              {successToast ? (
                <article className="workspace-state-card success">
                  <strong>Erfolg</strong>
                  <p>{successToast}</p>
                </article>
              ) : null}

              {showSongsEmptyState ? (
                <article className="workspace-state-card empty">
                  <strong>Noch keine Songs</strong>
                  <p>Lege den ersten Song an und starte direkt mit Metadaten, Files und Diskussion.</p>
                  <button type="button" onClick={() => setShowCreateSongModal(true)}>Ersten Song erstellen</button>
                </article>
              ) : null}

              {showSetlistsEmptyState ? (
                <article className="workspace-state-card empty">
                  <strong>Noch keine Setlists</strong>
                  <p>Erstelle eine Setlist und waehle Songs direkt im Setlist-Editor aus.</p>
                  <button type="button" onClick={() => setShowCreateSetlistModal(true)}>Erste Setlist erstellen</button>
                </article>
              ) : null}

              {showCalendarEmptyState ? (
                <article className="workspace-state-card info">
                  <strong>Kalender ist leer</strong>
                  <p>Lege den ersten Termin an und starte mit Verfuegbarkeiten im Monatsraster.</p>
                </article>
              ) : null}

              {showSongSelectionGuide ? (
                <article className="workspace-state-card guide">
                  <strong>Song auswaehlen</strong>
                  <p>Waehle links einen Song, um Overview, Files, Chords und Diskussion zu sehen.</p>
                </article>
              ) : null}
            </section>
          ) : null}

          {showSongsWorkspace && !selectedSong ? (
            <section className="empty-state">
              <h2>Kein Song ausgewaehlt</h2>
              <p>Waehle links einen Song oder lade zuerst deine Banddaten.</p>
            </section>
          ) : showAnyWorkspace ? (
            <>
              {showSetlistsWorkspace && selectedSetlist ? (
                <section className="box">
                  <div className="upload-queue-actions" style={{ marginBottom: "0.6rem" }}>
                    <button type="button" className="ghost" onClick={() => void copySetlist(selectedSetlist.id)}>Kopieren</button>
                    <button type="button" className="ghost" onClick={() => void exportSetlistPdf(selectedSetlist.id)}>PDF</button>
                    <button type="button" className="ghost" onClick={() => void deleteSetlist(selectedSetlist.id)}>Loeschen</button>
                  </div>
                  <div className="smart-suggestions" style={{ marginBottom: "0.8rem" }}>
                    <h4>Setlist-Details</h4>
                    <label>
                      Beschreibung
                      <textarea
                        rows={3}
                        value={setlistDescriptionDraft}
                        onChange={(event) => setSetlistDescriptionDraft(event.target.value)}
                        placeholder="Ablauf, Besetzung, Hinweise"
                      />
                    </label>
                    <div className="thread-form" style={{ marginTop: "0.45rem" }}>
                      <input
                        value={setlistInstrumentInput}
                        onChange={(event) => setSetlistInstrumentInput(event.target.value)}
                        placeholder="Instrument hinzufuegen (z.B. Akustikgitarre)"
                      />
                      <button type="button" onClick={addSetlistInstrument}>Instrument +</button>
                    </div>
                    <div className="upload-queue-actions" style={{ marginTop: "0.4rem", marginBottom: "0.4rem", flexWrap: "wrap" }}>
                      {setlistInstrumentsDraft.length === 0 ? <span style={{ color: "var(--muted)" }}>Keine Instrumente hinterlegt.</span> : null}
                      {setlistInstrumentsDraft.map((entry) => (
                        <button key={entry} type="button" className="ghost" onClick={() => removeSetlistInstrument(entry)}>
                          {entry} x
                        </button>
                      ))}
                    </div>
                    <div className="thread-form">
                      <input
                        value={setlistEquipmentInput}
                        onChange={(event) => setSetlistEquipmentInput(event.target.value)}
                        placeholder="Equipment hinzufuegen (z.B. In-Ear Rack)"
                      />
                      <button type="button" onClick={addSetlistEquipment}>Equipment +</button>
                    </div>
                    <div className="upload-queue-actions" style={{ marginTop: "0.4rem", flexWrap: "wrap" }}>
                      {setlistEquipmentDraft.length === 0 ? <span style={{ color: "var(--muted)" }}>Kein Equipment hinterlegt.</span> : null}
                      {setlistEquipmentDraft.map((entry) => (
                        <button key={entry} type="button" className="ghost" onClick={() => removeSetlistEquipment(entry)}>
                          {entry} x
                        </button>
                      ))}
                    </div>
                    <div className="upload-queue-actions" style={{ marginTop: "0.55rem" }}>
                      <button type="button" onClick={() => void saveSetlistDetails()}>Details speichern</button>
                    </div>
                  </div>
                  <h3>Setlist Reihenfolge (Drag & Drop)</h3>
                  <DragDropContext onDragEnd={(result) => void onSetlistDragEnd(result)}>
                    <Droppable droppableId={`setlist-${selectedSetlist.id}`}>
                      {(provided) => (
                        <div ref={provided.innerRef} {...provided.droppableProps} className="dnd-list">
                          {selectedSetlist.items.map((item, index) => (
                            <Draggable key={item.id} draggableId={item.id} index={index} isDragDisabled={!isEditMode}>
                              {(draggableProvided) => (
                                <div
                                  ref={draggableProvided.innerRef}
                                  {...draggableProvided.draggableProps}
                                  {...draggableProvided.dragHandleProps}
                                  className="dnd-item"
                                >
                                  <span>{index + 1}</span>
                                  <button
                                    type="button"
                                    className="setlist-song-link"
                                    onClick={() => {
                                      setSelectedSongId(item.song.id);
                                      setActiveSidebar("songs");
                                      void refreshSong(item.song.id);
                                      if (view === "setlists") {
                                        router.push(`/app/songs?songId=${item.song.id}`);
                                      }
                                    }}
                                  >
                                    {item.song.title}
                                  </button>
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </DragDropContext>
                  <div className="smart-suggestions" style={{ marginTop: "0.8rem" }}>
                    <h4>Smart Setlist Vorschlaege</h4>
                    {smartSetlistSuggestions.length === 0 ? <p>Keine Vorschlaege verfuegbar.</p> : (
                      <ul className="attachment-list">
                        {smartSetlistSuggestions.map((song) => (
                          <li key={song.id}>
                            <button
                              type="button"
                              className="setlist-song-link"
                              onClick={() => {
                                setSelectedSongId(song.id);
                                setActiveSidebar("songs");
                                void refreshSong(song.id);
                                if (view === "setlists") {
                                  router.push(`/app/songs?songId=${song.id}`);
                                }
                              }}
                            >
                              {song.title}
                            </button>
                            <span>{song.keySignature ?? "-"} | {song.tempoBpm ?? "-"} BPM | {song.workflowStatus ?? "draft"}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="smart-suggestions setlist-editor" style={{ marginTop: "0.8rem" }}>
                    <h4>Setlist Songs bearbeiten</h4>
                    <div className="thread-form setlist-editor-search" style={{ marginBottom: "0.5rem" }}>
                      <input
                        value={setlistSongSearch}
                        onChange={(event) => setSetlistSongSearch(event.target.value)}
                        placeholder="Songs in der Band suchen"
                      />
                    </div>
                    <div className="thread-list setlist-editor-list" style={{ maxHeight: "230px", overflow: "auto" }}>
                      {filteredSetlistCandidateSongs.map((song) => (
                        <label key={song.id} style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                          <input
                            type="checkbox"
                            checked={setlistEditorSongIds.includes(song.id)}
                            onChange={(event) => {
                              setSetlistEditorSongIds((prev) =>
                                event.target.checked
                                  ? [...prev, song.id]
                                  : prev.filter((id) => id !== song.id),
                              );
                            }}
                          />
                          <span>{song.title}</span>
                        </label>
                      ))}
                    </div>
                    <div className="upload-queue-actions setlist-editor-actions" style={{ marginTop: "0.55rem" }}>
                      <button type="button" onClick={() => void saveSetlistEditorSongs()}>Setlist speichern</button>
                      {smartSetlistSuggestions.slice(0, 3).map((song) => (
                        <button
                          key={`rec-${song.id}`}
                          type="button"
                          className="ghost"
                          onClick={() => {
                            if (!setlistEditorSongIds.includes(song.id)) {
                              setSetlistEditorSongIds((prev) => [...prev, song.id]);
                            }
                          }}
                        >
                          + Empfehlung: {song.title}
                        </button>
                      ))}
                    </div>
                  </div>
                </section>
              ) : null}

              {showCalendarWorkspace ? (
                <section className="box">
                  <h3>Konflikt Radar</h3>
                  {criticalEvents.length === 0 ? <p>Aktuell keine kritischen Termine erkannt.</p> : (
                    <ul className="attachment-list">
                      {criticalEvents.slice(0, 8).map((event) => (
                        <li key={event.id}>
                          <strong>{event.title}</strong>
                          <span>{new Date(event.startsAt).toLocaleString("de-DE")} | verfuegbar: {event.availabilitySummary?.availableCount ?? 0} | offen: {event.availabilitySummary?.missingResponses ?? 0}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ) : null}

              {selectedAlbum && showSongsWorkspace ? (
                <section className="box shell-album">
                  <h3>Album Details: {selectedAlbum.title}</h3>
                  <div className="upload-queue-actions" style={{ marginBottom: "0.55rem" }}>
                    <button type="button" className="ghost" onClick={() => void deleteAlbum(selectedAlbum.id)}>Album loeschen</button>
                  </div>
                  <form
                    className="inline-upload"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const formData = new FormData(event.currentTarget);
                      void uploadAlbumCover(selectedAlbum.id, formData);
                      event.currentTarget.reset();
                    }}
                  >
                    <input type="file" name="file" accept="image/*" />
                    <button type="submit" disabled={!isEditMode}>
                      Cover hochladen
                    </button>
                  </form>

                  {selectedAlbum.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={selectedAlbum.coverUrl}
                      alt={selectedAlbum.title}
                      className="album-cover"
                    />
                  ) : (
                    <p>Kein Cover gesetzt.</p>
                  )}

                  <h4>Track Editor</h4>
                  <DragDropContext onDragEnd={(result) => void onAlbumDragEnd(result)}>
                    <Droppable droppableId={`album-${selectedAlbum.id}`}>
                      {(provided) => (
                        <div ref={provided.innerRef} {...provided.droppableProps} className="dnd-list">
                          {(selectedAlbum.songs ?? []).map((song, index) => (
                            <Draggable
                              key={song.id}
                              draggableId={`album-track-${song.id}`}
                              index={index}
                              isDragDisabled={!isEditMode}
                            >
                              {(draggableProvided) => (
                                <div
                                  ref={draggableProvided.innerRef}
                                  {...draggableProvided.draggableProps}
                                  {...draggableProvided.dragHandleProps}
                                  className="dnd-item"
                                >
                                  <span>{index + 1}</span>
                                  <button
                                    type="button"
                                    className="setlist-song-link"
                                    onClick={() => {
                                      setSelectedSongId(song.id);
                                      void refreshSong(song.id);
                                    }}
                                  >
                                    {song.title}
                                  </button>
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </DragDropContext>
                </section>
              ) : null}

              <SongWorkspace
                ui={{
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
                }}
                actions={{
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
                }}
              />

              {view === "overview" ? <section className="box">
                <h3>Band Einladungen</h3>
                {!can("invites.manage") ? (
                  <p style={{ color: "var(--muted)" }}>
                    Invite-Management ist fuer deine Rolle nicht freigeschaltet.
                  </p>
                ) : null}
                <div className="thread-form">
                  <select
                    value={inviteFilter}
                    onChange={(event) => {
                      setInviteFilter(event.target.value as "all" | "open" | "expired" | "accepted" | "revoked");
                      setSelectedInviteIds([]);
                    }}
                  >
                    <option value="all">Alle</option>
                    <option value="open">Offen</option>
                    <option value="expired">Abgelaufen</option>
                    <option value="accepted">Angenommen</option>
                    <option value="revoked">Widerrufen</option>
                  </select>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => void bulkResendSelectedInvites()}
                    disabled={selectedInviteIds.length === 0 || !can("invites.manage")}
                  >
                    Auswahl erneut senden ({selectedInviteIds.length})
                  </button>
                </div>

                <div className="thread-form">
                  <input
                    type="email"
                    placeholder="mitglied@email.de"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    disabled={!can("invites.manage")}
                  />
                  <button type="button" onClick={() => void createInvite()} disabled={!can("invites.manage")} title={can("invites.manage") ? undefined : "Keine Berechtigung"}>
                    Einladung erstellen
                  </button>
                  <input
                    placeholder="Invite Link oder Token einloesen"
                    value={inviteTokenInput}
                    onChange={(event) => setInviteTokenInput(event.target.value)}
                  />
                  <button type="button" onClick={() => void acceptInviteToken()}>
                    Token annehmen
                  </button>
                </div>

                {lastInviteLink ? (
                  <p style={{ marginTop: "0.5rem", fontSize: "0.9rem" }}>
                    Einladungslink: <a href={lastInviteLink}>{lastInviteLink}</a>
                  </p>
                ) : null}

                <ul className="attachment-list">
                  {visibleInvites.map((invite) => (
                    <li key={invite.id}>
                      {!invite.acceptedAt && !invite.revokedAt ? (
                        <input
                          type="checkbox"
                          checked={selectedInviteIds.includes(invite.id)}
                          onChange={(event) => {
                            setSelectedInviteIds((prev) =>
                              event.target.checked
                                ? [...prev, invite.id]
                                : prev.filter((id) => id !== invite.id),
                            );
                          }}
                          aria-label={`invite-${invite.id}`}
                        />
                      ) : null}
                      <span>{invite.email}</span>
                      <span>{formatInviteStatus(invite)}</span>
                      {!invite.acceptedAt && !invite.revokedAt ? (
                        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                          <button type="button" className="ghost" onClick={() => void extendInvite(invite.id)} disabled={!can("invites.manage")}>
                            Ablauf aendern
                          </button>
                          <button type="button" className="ghost" onClick={() => void resendInvite(invite.id)} disabled={!can("invites.manage")}>
                            Erneut senden
                          </button>
                          <button type="button" className="ghost" onClick={() => void copyInviteLink(invite.id)} disabled={!can("invites.manage")}>
                            Link kopieren
                          </button>
                          <button type="button" className="ghost" onClick={() => void revokeInvite(invite.id)} disabled={!can("invites.manage")}>
                            Widerrufen
                          </button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section> : null}

              {showCalendarWorkspace ? (
                <CalendarPanel
                  events={events}
                  dayAvailabilities={dayAvailabilities}
                  currentMonth={selectedCalendarMonth}
                  newEventTitle={newEventTitle}
                  newEventStartsAt={newEventStartsAt}
                  newEventVenueLabel={newEventVenueLabel}
                  newEventRecurrenceEveryDays={newEventRecurrenceEveryDays}
                  newEventRecurrenceCount={newEventRecurrenceCount}
                  onChangeEventTitle={setNewEventTitle}
                  onChangeEventStartsAt={setNewEventStartsAt}
                  onChangeEventVenueLabel={setNewEventVenueLabel}
                  onChangeRecurrenceEveryDays={setNewEventRecurrenceEveryDays}
                  onChangeRecurrenceCount={setNewEventRecurrenceCount}
                  onCreateEvent={(payload) => void createEvent(payload)}
                  onUpdateAvailability={(eventId, status) => void updateAvailability(eventId, status)}
                  onSetDayAvailability={(date, status) => void setDayAvailability(date, status)}
                  onSetDayAvailabilityBulk={(dates, status) => void setDayAvailabilityBulk(dates, status)}
                  onMonthChange={setSelectedCalendarMonth}
                />
              ) : null}

              {showSetlistsWorkspace && selectedSetlist ? (
                <section className="box">
                  <h3>Rehearsal Mode: {selectedSetlist.name}</h3>
                  <div className="stage-hud">
                    <span>
                      Timer: {Math.floor(rehearsalElapsedSec / 60).toString().padStart(2, "0")}:
                      {(rehearsalElapsedSec % 60).toString().padStart(2, "0")}
                    </span>
                    <button type="button" onClick={() => setRehearsalRunning((prev) => !prev)}>
                      {rehearsalRunning ? "Pause" : "Start"}
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => {
                        setRehearsalRunning(false);
                        setRehearsalElapsedSec(0);
                        setSegmentRunning(false);
                        setSegmentElapsedSec(0);
                        setSegmentSongId(null);
                      }}
                    >
                      Reset
                    </button>
                  </div>
                  {segmentSongId ? (
                    <div className="stage-hud" style={{ marginTop: "0.45rem" }}>
                      <span>Segment Song: {rehearsalItems.find((item) => item.songId === segmentSongId)?.song.title ?? "-"}</span>
                      <span>Segment: {Math.floor(segmentElapsedSec / 60).toString().padStart(2, "0")}:{(segmentElapsedSec % 60).toString().padStart(2, "0")}</span>
                      <span>Plan: {(segmentPlanMinutes[segmentSongId] ?? 4)} min</span>
                      <button type="button" onClick={() => setSegmentRunning((prev) => !prev)}>{segmentRunning ? "Segment Pause" : "Segment Start"}</button>
                    </div>
                  ) : null}

                  <div className="thread-list">
                    {rehearsalItems.map((item) => (
                      <div key={item.songId} className="thread-card">
                        <strong>
                          {item.position}. {item.song.title}
                        </strong>
                        <div className="inline-tools">
                          <label>
                            Plan Minuten
                            <input
                              type="number"
                              min={1}
                              max={30}
                              value={segmentPlanMinutes[item.songId] ?? 4}
                              onChange={(event) => setSegmentPlanMinutes((prev) => ({ ...prev, [item.songId]: Number(event.target.value) || 4 }))}
                            />
                          </label>
                          <button
                            type="button"
                            className="ghost"
                            onClick={() => {
                              setSegmentSongId(item.songId);
                              setSegmentElapsedSec(0);
                              setSegmentRunning(true);
                            }}
                          >
                            Segment starten
                          </button>
                        </div>
                        <textarea
                          rows={3}
                          value={rehearsalNotes[item.songId] ?? ""}
                          onChange={(event) =>
                            setRehearsalNotes((prev) => ({
                              ...prev,
                              [item.songId]: event.target.value,
                            }))
                          }
                          placeholder="Probe-Notizen pro Song"
                        />
                        <button
                          type="button"
                          onClick={() => void saveRehearsalNote(item.songId, rehearsalNotes[item.songId] ?? "")}
                        >
                          Notiz speichern
                        </button>
                      </div>
                    ))}
                  </div>

                  <div style={{ marginTop: "0.8rem" }}>
                    <h4>Setlist Aufgabenboard</h4>
                    <div className="thread-form">
                      <input
                        value={newSetlistBoardTaskTitle}
                        onChange={(event) => setNewSetlistBoardTaskTitle(event.target.value)}
                        placeholder="Neue Board-Aufgabe"
                      />
                      <button type="button" onClick={addSetlistBoardTask}>
                        Board-Aufgabe erstellen
                      </button>
                    </div>
                    <div className="kanban-board">
                      <div className="kanban-col">
                        <h5>Offen</h5>
                        {setlistBoardColumns.open.map((task) => (
                          <div key={task.id} className="kanban-task">
                            <strong>{task.title}</strong>
                            <div className="upload-queue-actions">
                              <button type="button" className="ghost" onClick={() => moveSetlistBoardTask(task.id, "in_progress")}>Start</button>
                              <button type="button" className="ghost" onClick={() => deleteSetlistBoardTask(task.id)}>Loeschen</button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="kanban-col">
                        <h5>In Arbeit</h5>
                        {setlistBoardColumns.inProgress.map((task) => (
                          <div key={task.id} className="kanban-task">
                            <strong>{task.title}</strong>
                            <div className="upload-queue-actions">
                              <button type="button" className="ghost" onClick={() => moveSetlistBoardTask(task.id, "done")}>Fertig</button>
                              <button type="button" className="ghost" onClick={() => moveSetlistBoardTask(task.id, "open")}>Zurueck</button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="kanban-col">
                        <h5>Fertig</h5>
                        {setlistBoardColumns.done.map((task) => (
                          <div key={task.id} className="kanban-task">
                            <strong>{task.title}</strong>
                            <div className="upload-queue-actions">
                              <button type="button" className="ghost" onClick={() => moveSetlistBoardTask(task.id, "open")}>Wieder oeffnen</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>
              ) : null}

            </>
          ) : null}
        </main>
      </div>

      <CreateModal
        title="Lead Sheet Studio"
        isOpen={showLeadSheetStudio}
        onClose={() => setShowLeadSheetStudio(false)}
        onConfirm={() => void saveLeadSheetStudio()}
        confirmLabel="Lead Sheet speichern"
      >
        <p style={{ margin: 0, color: "var(--muted)" }}>
          Bearbeite Lyrics und ChordPro zentral und losgeloest vom Song-Metadaten-Formular.
        </p>
        <div className="chordpro-help">
          <strong>ChordPro Hilfe</strong>
          <p>Nutze [Am] fuer Akkorde und halte Lyrics im separaten Feld fuer klarere Pflege.</p>
        </div>
        <label>
          ChordPro
          <textarea
            rows={10}
            value={leadSheetDraftChordPro}
            onChange={(event) => setLeadSheetDraftChordPro(event.target.value)}
            placeholder="[Verse]\n[Am]Ich sehe [F]dich ..."
          />
        </label>
        <label>
          Lyrics
          <textarea
            rows={10}
            value={leadSheetDraftLyrics}
            onChange={(event) => setLeadSheetDraftLyrics(event.target.value)}
            placeholder="Songtext ohne Akkordsymbole"
          />
        </label>
      </CreateModal>

      <CreateModal
        title="Neuen Song erstellen"
        isOpen={showCreateSongModal}
        onClose={() => setShowCreateSongModal(false)}
        onConfirm={() => void createSong()}
        confirmLabel="Song erstellen"
      >
        <label>
          Songtitel
          <input value={newSongTitle} onChange={(event) => setNewSongTitle(event.target.value)} placeholder="z.B. Midnight Run" />
        </label>
        <label>
          Album
          <select value={newSongAlbumId} onChange={(event) => setNewSongAlbumId(event.target.value)}>
            <option value="">Kein Album</option>
            {albums.map((album) => (
              <option key={album.id} value={album.id}>{album.title}</option>
            ))}
          </select>
        </label>
        <div className="inline-tools">
          <label>
            Tonart
            <input value={newSongKeySignature} onChange={(event) => setNewSongKeySignature(event.target.value)} placeholder="z.B. Em" />
          </label>
          <label>
            BPM
            <input type="number" min={20} max={400} value={newSongTempoBpm} onChange={(event) => setNewSongTempoBpm(event.target.value)} placeholder="120" />
          </label>
        </div>
        <div className="inline-tools">
          <label>
            Dauer Minuten
            <input type="number" min={0} value={newSongDurationMinutes} onChange={(event) => setNewSongDurationMinutes(event.target.value)} placeholder="3" />
          </label>
          <label>
            Dauer Sekunden
            <input type="number" min={0} max={59} value={newSongDurationSeconds} onChange={(event) => setNewSongDurationSeconds(event.target.value)} placeholder="25" />
          </label>
        </div>
        <label>
          Spotify URL
          <input value={newSongSpotifyUrl} onChange={(event) => setNewSongSpotifyUrl(event.target.value)} placeholder="https://open.spotify.com/track/..." />
          {createSongSpotifyValidation.message ? (
            <small style={{ color: createSongSpotifyValidation.embedUrl ? "#1e6642" : "#9f2c23" }}>
              {createSongSpotifyValidation.message}
            </small>
          ) : null}
        </label>
      </CreateModal>

      <CreateModal
        title="Neues Album erstellen"
        isOpen={showCreateAlbumModal}
        onClose={() => setShowCreateAlbumModal(false)}
        onConfirm={() => void createAlbum()}
        confirmLabel="Album erstellen"
      >
        <label>
          Albumtitel
          <input value={newAlbumTitle} onChange={(event) => setNewAlbumTitle(event.target.value)} placeholder="z.B. Tour 2026" />
        </label>
      </CreateModal>

      <CreateModal
        title="Neue Setlist erstellen"
        isOpen={showCreateSetlistModal}
        onClose={() => setShowCreateSetlistModal(false)}
        onConfirm={() => void createSetlist()}
        confirmLabel="Setlist erstellen"
      >
        <label>
          Setlist Name
          <input value={newSetlistName} onChange={(event) => setNewSetlistName(event.target.value)} placeholder="z.B. Clubshow Freitag" />
        </label>
        <label>
          Beschreibung
          <textarea value={newSetlistDescription} onChange={(event) => setNewSetlistDescription(event.target.value)} rows={3} placeholder="Ablauf, Besetzung, Notizen" />
        </label>
        <label>
          Songs fuer diese Setlist
          <select
            multiple
            value={newSetlistSongIds}
            onChange={(event) => setNewSetlistSongIds(Array.from(event.target.selectedOptions).map((option) => option.value))}
            style={{ minHeight: "180px" }}
          >
            {songs.map((song) => (
              <option key={song.id} value={song.id}>{song.title}</option>
            ))}
          </select>
        </label>
      </CreateModal>

      <footer className="sticky-audio-footer">
        {currentAudio ? (
          <>
            <div>
              <strong>Aktiver Player</strong>
              <p>{currentAudio.name}</p>
            </div>
            <div className="sticky-player-controls">
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  const audioEl = stickyAudioRef.current;
                  if (!audioEl) {
                    return;
                  }
                  if (audioEl.paused) {
                    void audioEl.play();
                  } else {
                    audioEl.pause();
                  }
                }}
              >
                {stickyIsPlaying ? "Pause" : "Play"}
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  const audioEl = stickyAudioRef.current;
                  if (audioEl) {
                    audioEl.currentTime = Math.max(0, audioEl.currentTime - 10);
                  }
                }}
              >
                -10s
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  const audioEl = stickyAudioRef.current;
                  if (audioEl) {
                    const max = Number.isFinite(audioEl.duration) ? audioEl.duration : audioEl.currentTime + 10;
                    audioEl.currentTime = Math.min(max, audioEl.currentTime + 10);
                  }
                }}
              >
                +10s
              </button>
              <input
                type="range"
                min={0}
                max={Math.max(1, Math.floor(stickyDurationSec || 1))}
                value={Math.min(Math.floor(stickyCurrentSec), Math.floor(stickyDurationSec || 1))}
                onChange={(event) => {
                  const audioEl = stickyAudioRef.current;
                  if (audioEl) {
                    audioEl.currentTime = Number(event.target.value);
                  }
                }}
              />
              <span>
                {formatPlayerTime(stickyCurrentSec)} / {formatPlayerTime(stickyDurationSec)}
                {stickyDurationSec > 0 ? ` (-${formatPlayerTime(Math.max(0, stickyDurationSec - stickyCurrentSec))})` : ""}
              </span>
            </div>
            <audio ref={stickyAudioRef} controls src={currentAudio.url} preload="metadata" />
          </>
        ) : (
          <p>Waehle eine Audio-Version fuer den Sticky Player.</p>
        )}
      </footer>
    </div>
  );
}
