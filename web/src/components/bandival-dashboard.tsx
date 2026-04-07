"use client";

import { DragDropContext, Draggable, Droppable, DropResult } from "@hello-pangea/dnd";
import { ChordProParser, HtmlDivFormatter } from "chordsheetjs";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarPanel } from "@/components/panels/calendar-panel";
import { SetlistsPanel } from "@/components/panels/setlists-panel";
import { SongsPanel } from "@/components/panels/songs-panel";
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
};

type DiscussionThread = {
  id: string;
  title: string;
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

export function BandivalDashboard({ view = "overview" }: { view?: DashboardView }) {
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
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [selectedSetlistId, setSelectedSetlistId] = useState<string | null>(null);
  const [activeSidebar, setActiveSidebar] = useState<"songs" | "setlists">(view === "setlists" ? "setlists" : "songs");
  const [statusMessage, setStatusMessage] = useState<string>("Bandival bereit.");
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const isEditMode = true;
  const [isStageMode, setIsStageMode] = useState<boolean>(false);
  const [newAlbumTitle, setNewAlbumTitle] = useState<string>("");
  const [newSongTitle, setNewSongTitle] = useState<string>("");
  const [newSetlistName, setNewSetlistName] = useState<string>("");
  const [threadTitle, setThreadTitle] = useState<string>("");
  const [threadBody, setThreadBody] = useState<string>("");
  const [newEventTitle, setNewEventTitle] = useState<string>("");
  const [newEventStartsAt, setNewEventStartsAt] = useState<string>("");
  const [newEventRecurrenceEveryDays, setNewEventRecurrenceEveryDays] = useState<string>("");
  const [newEventRecurrenceCount, setNewEventRecurrenceCount] = useState<string>("");
  const [musicXmlDraft, setMusicXmlDraft] = useState<string>("");
  const [currentAudio, setCurrentAudio] = useState<{ url: string; name: string } | null>(null);
  const [isAutoScroll, setIsAutoScroll] = useState<boolean>(false);
  const [autoScrollSpeed, setAutoScrollSpeed] = useState<number>(0.65);
  const [nowMs, setNowMs] = useState<number>(0);
  const [showCreateSongModal, setShowCreateSongModal] = useState(false);
  const [showCreateAlbumModal, setShowCreateAlbumModal] = useState(false);
  const [showCreateSetlistModal, setShowCreateSetlistModal] = useState(false);
  const [showSongSettings, setShowSongSettings] = useState(false);
  const [songTab, setSongTab] = useState<"overview" | "settings" | "files" | "chords" | "discussion">("overview");
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

  useEffect(() => {
    setNowMs(Date.now());
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    setShowSongSettings(false);
    setSongTab("overview");
    setBpmTapHistory([]);
    setBpmTapValue(selectedSong?.tempoBpm?.toString() ?? "");
    setSongWorkflowStatus(selectedSong?.workflowStatus ?? parseWorkflowStatus(selectedSong?.notes ?? null));
    setAudioUploadQueue([]);
    setAttachmentUploadQueue([]);
    setLastUploadSuccess(null);
    setAudioUploadProgress(null);
    setAttachmentUploadProgress(null);
  }, [selectedSong?.id, selectedSong?.notes, selectedSong?.tempoBpm, selectedSong?.workflowStatus]);

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


  const showSongsWorkspace = view === "overview" || view === "songs";
  const showSetlistsWorkspace = view === "overview" || view === "setlists";
  const showCalendarWorkspace = view === "overview" || view === "calendar";
  const showAnyWorkspace = showSongsWorkspace || showSetlistsWorkspace || showCalendarWorkspace;

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
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Tagesverfuegbarkeit fehlgeschlagen.");
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
      const [songsRes, setlistsRes, albumsRes, eventsRes, bandRes, invitesRes, permissionsRes, notificationsRes, auditRes] = await Promise.all([
        apiFetch(`/api/songs?bandId=${targetBandId}`),
        apiFetch(`/api/setlists?bandId=${targetBandId}`),
        apiFetch(`/api/albums?bandId=${targetBandId}`),
        apiFetch(`/api/events?bandId=${targetBandId}`),
        apiFetch(`/api/bands/${targetBandId}`),
        apiFetch(`/api/bands/${targetBandId}/invites?status=all`),
        apiFetch(`/api/bands/${targetBandId}/permissions`),
        apiFetch(`/api/notifications?limit=30`),
        apiFetch(`/api/bands/${targetBandId}/audit?limit=200`),
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

      setSongs(
        ((songsData.songs ?? []) as Array<Partial<Song> & { id: string; title: string; updatedAt: string }>).map(
          normalizeSong,
        ),
      );
      setSetlists(setlistsData.setlists ?? []);
      setAlbums(albumsData.albums ?? []);
      setEvents(eventsData.events ?? []);
      setBandName(bandData.band?.name ?? "Bandival");
      setInvites(invitesData.invites ?? []);
      setSelectedInviteIds([]);
      setBandPermissions(permissionsData);
      setNotifications(notificationsData.notifications ?? []);
      setAuditLogs(auditData.logs ?? []);
      await loadDayAvailabilities(targetBandId, selectedCalendarMonth);

      localStorage.setItem(getBandCacheKey("songs", targetBandId), JSON.stringify(songsData.songs ?? []));
      localStorage.setItem(getBandCacheKey("setlists", targetBandId), JSON.stringify(setlistsData.setlists ?? []));
      localStorage.setItem(getBandCacheKey("events", targetBandId), JSON.stringify(eventsData.events ?? []));
      localStorage.setItem(getBandCacheKey("albums", targetBandId), JSON.stringify(albumsData.albums ?? []));

      if (songsData.songs?.length) {
        setSelectedSongId((prev) => prev ?? songsData.songs[0].id);
      }

      if (setlistsData.setlists?.length) {
        setSelectedSetlistId((prev) => prev ?? setlistsData.setlists[0].id);
      }

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
      setCurrentAudio({ url: current.fileUrl, name: `${nextSong.title} - ${current.fileName}` });
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
          albumId: null,
          lyricsMarkdown: "",
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Song konnte nicht erstellt werden.");
      }

      setNewSongTitle("");
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
      spotifyUrl: String(formData.get("spotifyUrl") ?? "") || null,
      workflowStatus,
      notes: notesBody || null,
      chordProText: String(formData.get("chordProText") ?? "") || null,
      lyricsMarkdown: String(formData.get("lyricsMarkdown") ?? "") || null,
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
      setStatusMessage("Song gespeichert.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Song-Update fehlgeschlagen.");
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
        id: window.crypto.randomUUID(),
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
        id: window.crypto.randomUUID(),
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
          songIds: selectedSong ? [selectedSong.id] : [],
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Setlist konnte nicht erstellt werden.");
      }

      setNewSetlistName("");
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

  async function updateBandName() {
    const nextName = window.prompt("Neuer Bandname:", bandName);
    if (!nextName || !nextName.trim()) {
      return;
    }

    try {
      const res = await apiFetch(`/api/bands/${bandId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nextName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Bandname konnte nicht aktualisiert werden.");
      }

      setBandName(data.band?.name ?? nextName.trim());
      setStatusMessage("Bandname aktualisiert.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Bandname-Update fehlgeschlagen.");
    }
  }

  async function createEvent() {
    if (!newEventTitle.trim() || !newEventStartsAt) {
      return;
    }

    try {
      const recurrenceEveryDays = Number(newEventRecurrenceEveryDays);
      const recurrenceCount = Number(newEventRecurrenceCount);

      const res = await apiFetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bandId,
          title: newEventTitle.trim(),
          startsAt: new Date(newEventStartsAt).toISOString(),
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
      setNewEventRecurrenceEveryDays("");
      setNewEventRecurrenceCount("");
      await loadData(bandId);
      const createdCount = Array.isArray(data.events) ? data.events.length : 1;
      setStatusMessage(createdCount > 1 ? `${createdCount} Serientermine erstellt.` : "Termin erstellt.");
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

      <header className="dashboard-header shell-header">
        <div className="header-brand-block">
          <div style={{ display: "flex", alignItems: "center", gap: "0.8rem" }}>
            <Image
              src="/bandival_logo.svg"
              alt="Bandival Logo"
              width={52}
              height={52}
              priority
            />
            <div>
              <h1>{bandName}</h1>
              <p>Bandmanagement fuer Songs, Setlists, Termine und Austausch</p>
            </div>
          </div>
        </div>
        <div className="header-actions">
          <div className="band-context">
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Suche Songs, Setlists, Alben"
              aria-label="Suche"
            />
            {searchQuery ? (
              <button type="button" className="ghost" onClick={() => setSearchQuery("")}>Suche leeren</button>
            ) : null}
            <button type="button" onClick={() => void loadData(bandId)} disabled={!bandId}>
              Neu laden
            </button>
            <button type="button" className="ghost" onClick={() => router.push("/app/calendar")}>Kalender</button>
            <button type="button" className="ghost" onClick={() => router.push("/app/activity")}>Activity</button>
            <button type="button" className={unreadNotificationCount > 0 ? "notif-btn has-unread" : "notif-btn"} onClick={() => setShowNotifications((prev) => !prev)}>
              Notifications {unreadNotificationCount > 0 ? `(${unreadNotificationCount})` : ""}
            </button>
            <button type="button" className="ghost" onClick={() => (window.location.href = "/app/settings")}>
              Einstellungen
            </button>
            {authUser ? (
              <button type="button" onClick={() => void logout()}>
                Logout ({authUser.email})
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
          <strong>{nextEvent ? new Date(nextEvent.startsAt).toLocaleDateString("de-DE") : "-"}</strong>
          <span>{nextEvent?.title ?? "kein kommender Termin"}</span>
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
              onCopySetlist={(setlistId) => void copySetlist(setlistId)}
              onSelectSetlistSong={(songId) => {
                setActiveSidebar("songs");
                setSelectedSongId(songId);
                void refreshSong(songId);
                if (view === "calendar") {
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

          {showSongsWorkspace && !selectedSong ? (
            <section className="empty-state">
              <h2>Kein Song ausgewaehlt</h2>
              <p>Waehle links einen Song oder lade zuerst deine Banddaten.</p>
            </section>
          ) : showAnyWorkspace ? (
            <>
              {showSetlistsWorkspace && selectedSetlist ? (
                <section className="box">
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
                    <Image
                      src={selectedAlbum.coverUrl}
                      alt={selectedAlbum.title}
                      className="album-cover"
                      width={320}
                      height={320}
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

              {showSongsWorkspace && selectedSong ? <div className="song-tabs">
                <button type="button" className={songTab === "overview" ? "active" : ""} onClick={() => setSongTab("overview")}>Overview</button>
                <button type="button" className={songTab === "settings" ? "active" : ""} onClick={() => setSongTab("settings")}>Settings</button>
                <button type="button" className={songTab === "files" ? "active" : ""} onClick={() => setSongTab("files")}>Files</button>
                <button type="button" className={songTab === "chords" ? "active" : ""} onClick={() => setSongTab("chords")}>Chords</button>
                <button type="button" className={songTab === "discussion" ? "active" : ""} onClick={() => setSongTab("discussion")}>Discussion</button>
              </div> : null}

              {showSongsWorkspace && selectedSong ? <section className="box-grid">
                {songTab === "settings" ? <article className="box">
                  <div className="song-head">
                    <h3>{selectedSong.title} <span className={`workflow-pill ${songWorkflowStatus}`}>{songWorkflowStatus}</span></h3>
                    <button type="button" className="ghost" onClick={() => setShowSongSettings((prev) => !prev)}>
                      {showSongSettings ? "Settings ausblenden" : "Song-Settings"}
                    </button>
                  </div>
                  {showSongSettings ? (
                    <form
                      onSubmit={(event) => {
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
                        <select name="albumId" defaultValue={selectedSong.albumId ?? ""}>
                          <option value="">Kein Album</option>
                          {albums.map((album) => (
                            <option key={album.id} value={album.id}>
                              {album.title}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Album Track #
                        <input name="albumTrackNo" type="number" defaultValue={selectedSong.albumTrackNo ?? ""} />
                      </label>
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
                        Dauer
                        <div className="inline-tools">
                          <input name="durationMinutes" type="number" min={0} defaultValue={Math.floor((selectedSong.durationSeconds ?? 0) / 60)} />
                          <input name="durationRestSeconds" type="number" min={0} max={59} defaultValue={(selectedSong.durationSeconds ?? 0) % 60} />
                        </div>
                      </label>
                      <label>
                        Spotify URL
                        <input name="spotifyUrl" defaultValue={selectedSong.spotifyUrl ?? ""} />
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
                      <div className="chordpro-help">
                        <strong>ChordPro Hilfe</strong>
                        <p>Nutze [Am] fuer Akkorde, leere Zeilen fuer Abschnitte und Text normal fuer Lyrics.</p>
                      </div>
                      <label>
                        Akkorde (ChordPro)
                        <textarea name="chordProText" defaultValue={selectedSong.chordProText ?? ""} rows={6} placeholder="[Verse]\n[Am]Ich sehe [F]dich ..." />
                      </label>
                      <label>
                        Lyrics
                        <textarea name="lyricsMarkdown" defaultValue={selectedSong.lyricsRevisions[0]?.lyricsMarkdown ?? ""} rows={8} />
                      </label>
                      <button type="submit">Song speichern</button>
                    </form>
                  ) : (
                    <p style={{ color: "var(--muted)" }}>Klicke auf Song-Settings, um BPM, Dauer, Chords und Metadaten zu bearbeiten.</p>
                  )}
                </article> : null}

                {songTab === "files" ? <article className="box">
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
                                  Retry
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
                          <p>Version {audio.versionNumber}</p>
                          {audio.isCurrent ? <span className="pill">Neueste</span> : null}
                        </div>
                        <button
                          type="button"
                          className="ghost"
                          onClick={() =>
                            setCurrentAudio({ url: audio.fileUrl, name: `${selectedSong.title} - ${audio.fileName}` })
                          }
                        >
                          Im Footer abspielen
                        </button>
                        <audio controls src={audio.fileUrl} preload="none" />
                      </div>
                    ))}
                  </div>
                </article> : null}

                {songTab === "files" ? <article className="box">
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
                                  Retry
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
                </article> : null}

                {songTab === "overview" ? <article className="box">
                  <h3>Spotify</h3>
                  {selectedSong.spotifyUrl ? (
                    <a href={selectedSong.spotifyUrl} target="_blank" rel="noreferrer">
                      Song auf Spotify oeffnen
                    </a>
                  ) : (
                    <p>Noch kein Spotify Link eingetragen.</p>
                  )}
                </article> : null}

                {songTab === "chords" ? <article className="box">
                  <h3>Akkorde Render</h3>
                  <ChordRender chordProText={selectedSong.chordProText ?? ""} />
                </article> : null}

                {songTab === "files" ? <article className="box">
                  <h3>Notenblatt Render</h3>
                  <SheetRender
                    musicXmlUrl={
                      selectedSong.attachments.find((att) => att.kind === "score_musicxml")?.fileUrl ?? null
                    }
                  />
                </article> : null}
              </section> : null}

              {showSongsWorkspace && selectedSong ? <section className="box">
                <h3>Song Aufgabenboard</h3>
                <div className="thread-form">
                  <input
                    value={newSongBoardTaskTitle}
                    onChange={(event) => setNewSongBoardTaskTitle(event.target.value)}
                    placeholder="Neue Song-Aufgabe"
                  />
                  <button type="button" onClick={addSongBoardTask}>Aufgabe anlegen</button>
                </div>
                <div className="kanban-board" style={{ marginTop: "0.6rem" }}>
                  <div className="kanban-col">
                    <h5>Offen</h5>
                    {songBoardColumns.open.map((task) => (
                      <div key={task.id} className="kanban-task">
                        <strong>{task.title}</strong>
                        <div className="upload-queue-actions">
                          <button type="button" className="ghost" onClick={() => moveSongBoardTask(task.id, "in_progress")}>Start</button>
                          <button type="button" className="ghost" onClick={() => deleteSongBoardTask(task.id)}>Loeschen</button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="kanban-col">
                    <h5>In Arbeit</h5>
                    {songBoardColumns.inProgress.map((task) => (
                      <div key={task.id} className="kanban-task">
                        <strong>{task.title}</strong>
                        <div className="upload-queue-actions">
                          <button type="button" className="ghost" onClick={() => moveSongBoardTask(task.id, "done")}>Done</button>
                          <button type="button" className="ghost" onClick={() => moveSongBoardTask(task.id, "open")}>Zurueck</button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="kanban-col">
                    <h5>Fertig</h5>
                    {songBoardColumns.done.map((task) => (
                      <div key={task.id} className="kanban-task">
                        <strong>{task.title}</strong>
                        <div className="upload-queue-actions">
                          <button type="button" className="ghost" onClick={() => moveSongBoardTask(task.id, "open")}>Reopen</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section> : null}

              {showSongsWorkspace && selectedSong && songTab === "discussion" ? <section className="box discussion-box shell-comments">
                <h3>Diskussionen und Themen</h3>
                <form className="thread-form" onSubmit={createThread}>
                  <input
                    value={threadTitle}
                    onChange={(event) => setThreadTitle(event.target.value)}
                    placeholder="Thema"
                  />
                  <textarea
                    value={threadBody}
                    onChange={(event) => setThreadBody(event.target.value)}
                    placeholder="Beschreibung"
                    rows={3}
                  />
                  <button type="submit">Thema erstellen</button>
                </form>

                <div className="thread-list">
                  {(selectedSong.threads ?? []).map((thread) => (
                    <ThreadCard key={thread.id} thread={thread} onAddPost={addPost} />
                  ))}
                </div>
              </section> : null}

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
                  newEventRecurrenceEveryDays={newEventRecurrenceEveryDays}
                  newEventRecurrenceCount={newEventRecurrenceCount}
                  onChangeEventTitle={setNewEventTitle}
                  onChangeEventStartsAt={setNewEventStartsAt}
                  onChangeRecurrenceEveryDays={setNewEventRecurrenceEveryDays}
                  onChangeRecurrenceCount={setNewEventRecurrenceCount}
                  onCreateEvent={() => void createEvent()}
                  onUpdateAvailability={(eventId, status) => void updateAvailability(eventId, status)}
                  onSetDayAvailability={(date, status) => void setDayAvailability(date, status)}
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
                        Board Task anlegen
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
                              <button type="button" className="ghost" onClick={() => moveSetlistBoardTask(task.id, "done")}>Done</button>
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
                              <button type="button" className="ghost" onClick={() => moveSetlistBoardTask(task.id, "open")}>Reopen</button>
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
      </CreateModal>

      <footer className="sticky-audio-footer">
        {currentAudio ? (
          <>
            <div>
              <strong>Aktiver Player</strong>
              <p>{currentAudio.name}</p>
            </div>
            <audio controls src={currentAudio.url} autoPlay preload="none" />
          </>
        ) : (
          <p>Waehle eine Audio-Version fuer den Sticky Player.</p>
        )}
      </footer>
    </div>
  );
}

type ThreadCardProps = {
  thread: DiscussionThread;
  onAddPost: (threadId: string, body: string) => Promise<void>;
};

function CreateModal(props: {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  children: ReactNode;
}) {
  const { title, isOpen, onClose, onConfirm, confirmLabel, children } = props;
  if (!isOpen) {
    return null;
  }

  return (
    <div className="create-modal-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="create-modal">
        <h3>{title}</h3>
        <div className="create-modal-body">{children}</div>
        <div className="create-modal-actions">
          <button type="button" className="ghost" onClick={onClose}>Abbrechen</button>
          <button type="button" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function ThreadCard({ thread, onAddPost }: ThreadCardProps) {
  const [reply, setReply] = useState<string>("");

  return (
    <article className="thread-card">
      <h4>{thread.title}</h4>
      <ul>
        {thread.posts.map((post) => (
          <li key={post.id}>{post.body}</li>
        ))}
      </ul>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void onAddPost(thread.id, reply);
          setReply("");
        }}
      >
        <input
          value={reply}
          onChange={(event) => setReply(event.target.value)}
          placeholder="Antwort schreiben"
        />
        <button type="submit">Senden</button>
      </form>
    </article>
  );
}

function ChordRender({ chordProText }: { chordProText: string }) {
  if (!chordProText.trim()) {
    return <p>Keine Akkorde vorhanden.</p>;
  }

  let chordHtml: string | null = null;
  let failed = false;

  try {
    const parser = new ChordProParser();
    const song = parser.parse(chordProText);
    const formatter = new HtmlDivFormatter();
    chordHtml = formatter.format(song);
  } catch {
    failed = true;
  }

  if (failed || !chordHtml) {
    return <p>Akkorde konnten nicht gerendert werden. Bitte ChordPro Syntax pruefen.</p>;
  }

  return <div className="chord-render" dangerouslySetInnerHTML={{ __html: chordHtml }} />;
}

function SheetRender({ musicXmlUrl }: { musicXmlUrl: string | null }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let isCancelled = false;

    async function render() {
      if (!musicXmlUrl || !containerRef.current) {
        return;
      }

      try {
        const [osmdModule, xmlRes] = await Promise.all([
          import("opensheetmusicdisplay"),
          fetch(musicXmlUrl),
        ]);

        const xmlContent = await xmlRes.text();
        const osmd = new osmdModule.OpenSheetMusicDisplay(containerRef.current, {
          autoResize: true,
          drawingParameters: "compact",
        });
        await osmd.load(xmlContent);
        if (!isCancelled) {
          osmd.render();
          setError("");
        }
      } catch {
        if (!isCancelled) {
          setError("Notenblatt konnte nicht gerendert werden.");
        }
      }
    }

    void render();
    return () => {
      isCancelled = true;
    };
  }, [musicXmlUrl]);

  if (!musicXmlUrl) {
    return <p>Noch kein MusicXML Notenblatt vorhanden.</p>;
  }

  return (
    <div>
      {error ? <p>{error}</p> : null}
      <div ref={containerRef} className="sheet-render" />
    </div>
  );
}
