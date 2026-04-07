"use client";

import { DragDropContext, Draggable, Droppable, DropResult } from "@hello-pangea/dnd";
import { ChordProParser, HtmlDivFormatter } from "chordsheetjs";
import Image from "next/image";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

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

type SongLyricsRevision = {
  id: string;
  title: string | null;
  lyricsMarkdown: string;
  revisionNumber: number;
  isCurrent: boolean;
};

type DiscussionPost = {
  id: string;
  body: string;
  createdAt: string;
};

type DiscussionThread = {
  id: string;
  title: string;
  posts: DiscussionPost[];
};

type Song = {
  id: string;
  title: string;
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
  };
};

type BandInvite = {
  id: string;
  email: string;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
};

type AuditLogEntry = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt: string;
  actor?: {
    displayName?: string | null;
    email: string;
  } | null;
};

type RehearsalItem = {
  songId: string;
  position: number;
  song: {
    title: string;
  };
};

type RehearsalNote = {
  songId: string;
  note: string;
  updatedAt: string;
};

type SessionUser = {
  userId: string;
  email: string;
};

const EMPTY_UUID = "00000000-0000-0000-0000-000000000000";
const OFFLINE_QUEUE_KEY = "bandival.sync.queue";

export function BandivalDashboard() {
  const [bandId, setBandId] = useState<string>(EMPTY_UUID);
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
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [inviteEmail, setInviteEmail] = useState<string>("");
  const [lastInviteLink, setLastInviteLink] = useState<string>("");
  const [inviteTokenInput, setInviteTokenInput] = useState<string>("");
  const [rehearsalItems, setRehearsalItems] = useState<RehearsalItem[]>([]);
  const [rehearsalNotes, setRehearsalNotes] = useState<Record<string, string>>({});
  const [rehearsalElapsedSec, setRehearsalElapsedSec] = useState<number>(0);
  const [rehearsalRunning, setRehearsalRunning] = useState<boolean>(false);
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [selectedSetlistId, setSelectedSetlistId] = useState<string | null>(null);
  const [activeSidebar, setActiveSidebar] = useState<"songs" | "setlists">("songs");
  const [statusMessage, setStatusMessage] = useState<string>("Bandival bereit.");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const [isStageMode, setIsStageMode] = useState<boolean>(false);
  const [newAlbumTitle, setNewAlbumTitle] = useState<string>("");
  const [newSongTitle, setNewSongTitle] = useState<string>("");
  const [newSetlistName, setNewSetlistName] = useState<string>("");
  const [threadTitle, setThreadTitle] = useState<string>("");
  const [threadBody, setThreadBody] = useState<string>("");
  const [musicXmlDraft, setMusicXmlDraft] = useState<string>("");
  const [currentAudio, setCurrentAudio] = useState<{ url: string; name: string } | null>(null);
  const [isAutoScroll, setIsAutoScroll] = useState<boolean>(false);
  const [autoScrollSpeed, setAutoScrollSpeed] = useState<number>(0.65);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const mainContentRef = useRef<HTMLElement | null>(null);

  const selectedSong = useMemo(
    () => songs.find((song) => song.id === selectedSongId) ?? null,
    [songs, selectedSongId],
  );

  const selectedSetlist = useMemo(
    () => setlists.find((setlist) => setlist.id === selectedSetlistId) ?? null,
    [setlists, selectedSetlistId],
  );

  const selectedAlbum = useMemo(
    () => albums.find((album) => album.id === selectedAlbumId) ?? null,
    [albums, selectedAlbumId],
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

  const filteredSetlists = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return setlists;
    }

    return setlists.filter((setlist) => {
      const songNames = setlist.items.map((item) => item.song.title).join(" ");
      return `${setlist.name} ${setlist.description ?? ""} ${songNames}`.toLowerCase().includes(q);
    });
  }, [setlists, searchQuery]);

  useEffect(() => {
    const storedBandId = window.localStorage.getItem("bandival.bandId");
    const tokenFromQuery = new URLSearchParams(window.location.search).get("inviteToken")
      ?? new URLSearchParams(window.location.search).get("token");

    if (storedBandId) {
      setBandId(storedBandId);
    }

    if (tokenFromQuery) {
      setInviteTokenInput(tokenFromQuery);
    }

    void refreshSession();
  }, []);

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
  }, [isStageMode, selectedSetlist, selectedSongId]);

  useEffect(() => {
    const onOnline = () => {
      void flushOfflineQueue();
      window.location.reload();
    };

    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  useEffect(() => {
    if (!selectedSetlistId) {
      setRehearsalItems([]);
      setRehearsalNotes({});
      return;
    }

    void loadRehearsal(selectedSetlistId);
  }, [selectedSetlistId]);

  useEffect(() => {
    if (!rehearsalRunning) {
      return;
    }

    const interval = window.setInterval(() => {
      setRehearsalElapsedSec((prev) => prev + 1);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [rehearsalRunning]);

  function readCookie(name: string): string | null {
    const match = document.cookie
      .split(";")
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith(`${name}=`));
    return match ? decodeURIComponent(match.split("=").slice(1).join("=")) : null;
  }

  async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    const method = (init.method ?? "GET").toUpperCase();
    const headers = new Headers(init.headers ?? undefined);

    if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
      headers.set("x-csrf-token", readCookie("bandival_csrf") ?? "");
    }

    return fetch(input, { ...init, headers });
  }

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

  async function flushOfflineQueue() {
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
  }

  async function refreshSession() {
    const res = await apiFetch("/api/auth/me", { cache: "no-store" });
    if (!res.ok) {
      setAuthUser(null);
      return;
    }

    const data = await res.json();
    setAuthUser(data.user ?? null);
  }

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

      setAuthUser(data.user ?? null);
      setStatusMessage("Session gestartet.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Login fehlgeschlagen.");
    }
  }

  async function logout() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    setAuthUser(null);
    setStatusMessage("Abgemeldet.");
  }

  async function loadData(targetBandId: string) {
    if (!targetBandId || targetBandId.length !== 36) {
      setStatusMessage("Bitte eine gueltige bandId eintragen.");
      return;
    }

    setIsLoading(true);

    try {
      const [songsRes, setlistsRes, albumsRes, eventsRes, bandRes, invitesRes, auditRes] = await Promise.all([
        apiFetch(`/api/songs?bandId=${targetBandId}`),
        apiFetch(`/api/setlists?bandId=${targetBandId}`),
        apiFetch(`/api/albums?bandId=${targetBandId}`),
        apiFetch(`/api/events?bandId=${targetBandId}`),
        apiFetch(`/api/bands/${targetBandId}`),
        apiFetch(`/api/bands/${targetBandId}/invites`),
        apiFetch(`/api/bands/${targetBandId}/audit?limit=40`),
      ]);

      const songsData = await songsRes.json();
      const setlistsData = await setlistsRes.json();
      const albumsData = await albumsRes.json();
      const eventsData = await eventsRes.json();
      const bandData = await bandRes.json();
      const invitesData = await invitesRes.json();
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

      if (!auditRes.ok) {
        throw new Error(auditData.error ?? "Audit-Log konnte nicht geladen werden.");
      }

      setSongs(songsData.songs ?? []);
      setSetlists(setlistsData.setlists ?? []);
      setAlbums(albumsData.albums ?? []);
      setEvents(eventsData.events ?? []);
      setBandName(bandData.band?.name ?? "Bandival");
      setInvites(invitesData.invites ?? []);
      setAuditLogs(auditData.logs ?? []);

      localStorage.setItem("bandival.cache.songs", JSON.stringify(songsData.songs ?? []));
      localStorage.setItem("bandival.cache.setlists", JSON.stringify(setlistsData.setlists ?? []));
      localStorage.setItem("bandival.cache.events", JSON.stringify(eventsData.events ?? []));

      if (!selectedSongId && songsData.songs?.length) {
        setSelectedSongId(songsData.songs[0].id);
      }

      if (!selectedSetlistId && setlistsData.setlists?.length) {
        setSelectedSetlistId(setlistsData.setlists[0].id);
      }

      setStatusMessage("Daten geladen.");
      window.localStorage.setItem("bandival.bandId", targetBandId);
    } catch (error) {
      const cachedSongs = localStorage.getItem("bandival.cache.songs");
      const cachedSetlists = localStorage.getItem("bandival.cache.setlists");
      const cachedEvents = localStorage.getItem("bandival.cache.events");

      if (cachedSongs && cachedSetlists) {
        setSongs(JSON.parse(cachedSongs));
        setSetlists(JSON.parse(cachedSetlists));
        setEvents(cachedEvents ? JSON.parse(cachedEvents) : []);
        setStatusMessage("Offline: lokale Daten geladen.");
      } else {
        setStatusMessage(error instanceof Error ? error.message : "Laden fehlgeschlagen.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function refreshSong(songId: string) {
    const response = await apiFetch(`/api/songs/${songId}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error ?? "Song konnte nicht geladen werden.");
    }

    const nextSong: Song = data.song;
    setSongs((prev) => prev.map((s) => (s.id === nextSong.id ? nextSong : s)));
    setSelectedAlbumId(nextSong.albumId ?? null);

    const current = nextSong.audioVersions.find((audio) => audio.isCurrent);
    if (current) {
      setCurrentAudio({ url: current.fileUrl, name: `${nextSong.title} - ${current.fileName}` });
    }
  }

  async function createSong(event: FormEvent) {
    event.preventDefault();

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

    const payload = {
      title: String(formData.get("title") ?? ""),
      albumId: String(formData.get("albumId") ?? "") || null,
      albumTrackNo: Number(formData.get("albumTrackNo") ?? 0) || null,
      keySignature: String(formData.get("keySignature") ?? "") || null,
      tempoBpm: Number(formData.get("tempoBpm") ?? 0) || null,
      durationSeconds: Number(formData.get("durationSeconds") ?? 0) || null,
      spotifyUrl: String(formData.get("spotifyUrl") ?? "") || null,
      notes: String(formData.get("notes") ?? "") || null,
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
      setIsEditMode(false);
      setStatusMessage("Song gespeichert.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Song-Update fehlgeschlagen.");
    }
  }

  async function uploadAttachment(formData: FormData) {
    if (!isEditMode) {
      setStatusMessage("Datei-Uploads sind nur im Bearbeiten-Modus moeglich.");
      return;
    }

    if (!selectedSong) {
      return;
    }

    try {
      const response = await apiFetch(`/api/songs/${selectedSong.id}/attachments`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Datei-Upload fehlgeschlagen.");
      }

      await refreshSong(selectedSong.id);
      setStatusMessage("Datei hochgeladen.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Upload fehlgeschlagen.");
    }
  }

  async function uploadAudio(formData: FormData) {
    if (!isEditMode) {
      setStatusMessage("Audio-Uploads sind nur im Bearbeiten-Modus moeglich.");
      return;
    }

    if (!selectedSong) {
      return;
    }

    try {
      const response = await apiFetch(`/api/songs/${selectedSong.id}/audio`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Audio-Upload fehlgeschlagen.");
      }

      await refreshSong(selectedSong.id);
      setStatusMessage("Audio-Version hochgeladen, neueste Version hervorgehoben.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Audio-Upload fehlgeschlagen.");
    }
  }

  async function createSetlist(event: FormEvent) {
        if (!isEditMode) {
          setStatusMessage("Setlists koennen nur im Bearbeiten-Modus erstellt werden.");
          return;
        }

    event.preventDefault();

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
      await loadData(bandId);
      setStatusMessage("Setlist erstellt.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Setlist-Erstellung fehlgeschlagen.");
    }
  }

  async function copySetlist(setlistId: string) {
    if (!isEditMode) {
      setStatusMessage("Setlist-Kopie nur im Bearbeiten-Modus.");
      return;
    }

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
        if (!isEditMode) {
          setStatusMessage("Diskussionen koennen nur im Bearbeiten-Modus erstellt werden.");
          return;
        }

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
        if (!isEditMode) {
          setStatusMessage("Antworten sind nur im Bearbeiten-Modus moeglich.");
          return;
        }

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

  async function createAlbum(event: FormEvent) {
    event.preventDefault();
    if (!isEditMode || !newAlbumTitle.trim()) {
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

  async function runAccountAction(action: "profile" | "password" | "leave" | "delete") {
    try {
      const authHeaders = { "Content-Type": "application/json" };

      if (action === "profile") {
        const res = await apiFetch("/api/account/profile", {
          method: "PATCH",
          headers: authHeaders,
          body: JSON.stringify({ displayName: "Bandival User" }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error ?? "Profilupdate fehlgeschlagen.");
        }
        setStatusMessage("Profil aktualisiert.");
      }

      if (action === "password") {
        const currentPassword = window.prompt("Aktuelles Passwort eingeben:");
        const newPassword = window.prompt("Neues Passwort eingeben (min. 10 Zeichen):");
        if (!currentPassword || !newPassword) {
          return;
        }

        const res = await apiFetch("/api/account/password", {
          method: "PATCH",
          headers: authHeaders,
          body: JSON.stringify({ currentPassword, newPassword }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error ?? "Passwortupdate fehlgeschlagen.");
        }
        setStatusMessage("Passwort geaendert.");
      }

      if (action === "leave") {
        const res = await apiFetch("/api/account/leave-band", {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ bandId }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error ?? "Band verlassen fehlgeschlagen.");
        }
        setStatusMessage("Band wurde verlassen.");
      }

      if (action === "delete") {
        const password = window.prompt("Passwort zur Bestaetigung eingeben:");
        if (!password) {
          return;
        }

        const res = await apiFetch("/api/account/delete", {
          method: "DELETE",
          headers: authHeaders,
          body: JSON.stringify({ password }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error ?? "Account loeschen fehlgeschlagen.");
        }
        setStatusMessage("Account geloescht.");
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Account Aktion fehlgeschlagen.");
    }
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

  async function createInvite() {
    if (!inviteEmail.trim()) {
      return;
    }

    try {
      const res = await apiFetch(`/api/bands/${bandId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Einladung konnte nicht erstellt werden.");
      }

      setInvites((prev) => [data.invite, ...prev]);
      setInviteEmail("");
      const inviteLink = `${window.location.origin}/app?inviteToken=${encodeURIComponent(data.inviteToken)}`;
      setLastInviteLink(inviteLink);
      setStatusMessage("Einladung erstellt. Link kann direkt geteilt werden.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Einladung fehlgeschlagen.");
    }
  }

  function extractInviteToken(rawValue: string): string {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      return "";
    }

    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      try {
        const parsed = new URL(trimmed);
        return parsed.searchParams.get("inviteToken") ?? parsed.searchParams.get("token") ?? "";
      } catch {
        return "";
      }
    }

    return trimmed;
  }

  async function acceptInviteToken() {
    const inviteToken = extractInviteToken(inviteTokenInput);
    if (!inviteToken) {
      setStatusMessage("Bitte gueltigen Invite-Link oder Token eingeben.");
      return;
    }

    try {
      const res = await apiFetch("/api/band-invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: inviteToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Einladung konnte nicht angenommen werden.");
      }

      setInviteTokenInput("");
      setStatusMessage("Einladung angenommen.");
      if (data.bandId) {
        setBandId(data.bandId);
        await loadData(data.bandId);
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Einladungsannahme fehlgeschlagen.");
    }
  }

  async function revokeInvite(inviteId: string) {
    try {
      const res = await apiFetch(`/api/bands/${bandId}/invites/${inviteId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Einladung konnte nicht widerrufen werden.");
      }

      setInvites((prev) => prev.filter((invite) => invite.id !== inviteId));
      setStatusMessage("Einladung widerrufen.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Widerruf fehlgeschlagen.");
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

  async function loadRehearsal(setlistId: string) {
    try {
      const res = await apiFetch(`/api/setlists/${setlistId}/rehearsal`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Rehearsal-Daten konnten nicht geladen werden.");
      }

      setRehearsalItems(data.items ?? []);
      const mapped = Object.fromEntries(
        (data.notes as RehearsalNote[]).map((note) => [note.songId, note.note]),
      ) as Record<string, string>;
      setRehearsalNotes(mapped);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Rehearsal-Daten fehlgeschlagen.");
    }
  }

  async function saveRehearsalNote(songId: string, note: string) {
    if (!selectedSetlistId) {
      return;
    }

    try {
      const res = await apiFetch(`/api/setlists/${selectedSetlistId}/rehearsal`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songId, note }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Rehearsal-Notiz konnte nicht gespeichert werden.");
      }

      setRehearsalNotes((prev) => ({ ...prev, [songId]: data.note.note }));
      setStatusMessage("Rehearsal-Notiz gespeichert.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Rehearsal-Notiz fehlgeschlagen.");
    }
  }

  async function saveMusicXmlDraft() {
    if (!selectedSong || !musicXmlDraft.trim()) {
      return;
    }

    const file = new File([musicXmlDraft], `${selectedSong.title}-score.musicxml`, {
      type: "application/vnd.recordare.musicxml+xml",
    });
    const formData = new FormData();
    formData.append("kind", "score_musicxml");
    formData.append("file", file);
    await uploadAttachment(formData);
    setMusicXmlDraft("");
  }

  return (
    <div className={isStageMode ? "dashboard-shell stage-mode" : "dashboard-shell"}>
      {isStageMode ? (
        <button type="button" className="stage-exit" onClick={() => setIsStageMode(false)}>
          Stage verlassen
        </button>
      ) : null}

      <header className="dashboard-header shell-header">
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
        <div className="header-actions">
          <form
            className="band-context"
            onSubmit={(event) => {
              event.preventDefault();
              void loadData(bandId);
            }}
          >
            <input
              value={bandId}
              onChange={(event) => setBandId(event.target.value)}
              placeholder="bandId"
              aria-label="Band ID"
            />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Suche Songs, Setlists, Alben"
              aria-label="Suche"
            />
            <button type="submit">Laden</button>
            <button type="button" className="ghost" onClick={() => void updateBandName()} disabled={!isEditMode}>
              Bandname aendern
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
                />
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.target.value)}
                  placeholder="passwort"
                  aria-label="Passwort"
                />
                <button type="button" onClick={() => void login()}>
                  Login
                </button>
              </>
            )}
          </form>
          <details className="account-menu">
            <summary>Account Settings</summary>
            <div>
              <button type="button" onClick={() => void runAccountAction("profile")}>
                Profilbild aendern
              </button>
              <button type="button" onClick={() => void runAccountAction("password")}>
                Passwort aendern
              </button>
              <button type="button" onClick={() => void runAccountAction("leave")}>
                Band verlassen
              </button>
              <button type="button" className="danger" onClick={() => void runAccountAction("delete")}>
                Account loeschen
              </button>
            </div>
          </details>
        </div>
      </header>

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
            <>
              <form className="quick-form" onSubmit={createSong}>
                <input
                  value={newSongTitle}
                  onChange={(event) => setNewSongTitle(event.target.value)}
                  placeholder="Neuer Songtitel"
                  disabled={!isEditMode}
                />
                <button type="submit" disabled={!isEditMode}>
                  + Song
                </button>
              </form>

              <form className="quick-form" onSubmit={createAlbum}>
                <input
                  value={newAlbumTitle}
                  onChange={(event) => setNewAlbumTitle(event.target.value)}
                  placeholder="Neues Album"
                  disabled={!isEditMode}
                />
                <button type="submit" disabled={!isEditMode}>
                  + Album
                </button>
              </form>

              <div className="album-chips">
                {albums.map((album) => (
                  <button
                    key={album.id}
                    type="button"
                    className={selectedAlbumId === album.id ? "album-chip active" : "album-chip"}
                    onClick={() => setSelectedAlbumId(album.id)}
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
                      onClick={() => {
                        setSelectedSongId(song.id);
                        void refreshSong(song.id);
                      }}
                    >
                      <span>{song.album?.title ? `${song.album.title} - ${song.title}` : song.title}</span>
                      <small>{new Date(song.updatedAt).toLocaleDateString("de-DE")}</small>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <form className="quick-form" onSubmit={createSetlist}>
                <input
                  value={newSetlistName}
                  onChange={(event) => setNewSetlistName(event.target.value)}
                  placeholder="Neue Setlist"
                  disabled={!isEditMode}
                />
                <button type="submit" disabled={!isEditMode}>
                  + Setlist
                </button>
              </form>
              <ul>
                {filteredSetlists.map((setlist) => (
                  <li key={setlist.id}>
                    <div className="setlist-item">
                      <button
                        type="button"
                        className="setlist-title"
                        onClick={() => setSelectedSetlistId(setlist.id)}
                      >
                        {setlist.name}
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => void copySetlist(setlist.id)}
                        disabled={!isEditMode}
                      >
                        Kopieren
                      </button>
                    </div>
                    <div className="setlist-songs">
                      {setlist.items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setActiveSidebar("songs");
                            setSelectedSongId(item.song.id);
                            void refreshSong(item.song.id);
                          }}
                        >
                          {item.position}. {item.song.title}
                        </button>
                      ))}

                      <button type="button" onClick={() => void exportSetlistPdf(setlist.id)}>
                        PDF Export
                      </button>

                      <button type="button" className="ghost" onClick={() => setIsStageMode((prev) => !prev)}>
                        {isStageMode ? "Stage aus" : "Stage-Modus"}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
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
            <span>{isLoading ? "Lade ..." : statusMessage}</span>
            <button type="button" className={isEditMode ? "mode-edit" : "mode-read"} onClick={() => setIsEditMode((prev) => !prev)}>
              {isEditMode ? "Bearbeiten-Modus" : "Lese-Modus"}
            </button>
          </div>

          {!selectedSong ? (
            <section className="empty-state">
              <h2>Kein Song ausgewaehlt</h2>
              <p>Waehle links einen Song oder lade zuerst deine Banddaten.</p>
            </section>
          ) : (
            <>
              {selectedSetlist ? (
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
                </section>
              ) : null}

              {selectedAlbum ? (
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

              <section className="box-grid">
                <article className="box">
                  <h3>Song Basisdaten</h3>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      const formData = new FormData(event.currentTarget);
                      void updateSong(formData);
                    }}
                  >
                    <label>
                      Titel
                      <input name="title" defaultValue={selectedSong.title} disabled={!isEditMode} />
                    </label>
                    <label>
                      Album
                      <select name="albumId" defaultValue={selectedSong.albumId ?? ""} disabled={!isEditMode}>
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
                      <input
                        name="albumTrackNo"
                        type="number"
                        defaultValue={selectedSong.albumTrackNo ?? ""}
                        disabled={!isEditMode}
                      />
                    </label>
                    <label>
                      Tonart
                      <input
                        name="keySignature"
                        defaultValue={selectedSong.keySignature ?? ""}
                        disabled={!isEditMode}
                      />
                    </label>
                    <label>
                      BPM
                      <input
                        name="tempoBpm"
                        type="number"
                        step="0.01"
                        defaultValue={selectedSong.tempoBpm?.toString() ?? ""}
                        disabled={!isEditMode}
                      />
                    </label>
                    <label>
                      Dauer in Sekunden
                      <input
                        name="durationSeconds"
                        type="number"
                        defaultValue={selectedSong.durationSeconds ?? ""}
                        disabled={!isEditMode}
                      />
                    </label>
                    <label>
                      Spotify URL
                      <input
                        name="spotifyUrl"
                        defaultValue={selectedSong.spotifyUrl ?? ""}
                        disabled={!isEditMode}
                      />
                    </label>
                    <label>
                      Notizen
                      <textarea
                        name="notes"
                        defaultValue={selectedSong.notes ?? ""}
                        rows={3}
                        disabled={!isEditMode}
                      />
                    </label>
                    <label>
                      Akkorde (ChordPro)
                      <textarea
                        name="chordProText"
                        defaultValue={selectedSong.chordProText ?? ""}
                        rows={6}
                        disabled={!isEditMode}
                      />
                    </label>
                    <label>
                      Lyrics
                      <textarea
                        name="lyricsMarkdown"
                        defaultValue={selectedSong.lyricsRevisions[0]?.lyricsMarkdown ?? ""}
                        rows={8}
                        disabled={!isEditMode}
                      />
                    </label>
                    <button type="submit" disabled={!isEditMode}>
                      Song speichern
                    </button>
                  </form>
                </article>

                <article className="box">
                  <h3>Audio Versionen</h3>
                  <form
                    className="inline-upload"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const formData = new FormData(event.currentTarget);
                      void uploadAudio(formData);
                      event.currentTarget.reset();
                    }}
                  >
                    <input name="file" type="file" accept="audio/*" />
                    <button type="submit" disabled={!isEditMode}>
                      Audio hochladen
                    </button>
                  </form>
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
                </article>

                <article className="box">
                  <h3>Dateien, Notenblaetter, Leadsheets</h3>
                  <form
                    className="inline-upload"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const formData = new FormData(event.currentTarget);
                      void uploadAttachment(formData);
                      event.currentTarget.reset();
                    }}
                  >
                    <select name="kind" defaultValue="other">
                      <option value="other">Datei</option>
                      <option value="lead_sheet">Leadsheet</option>
                      <option value="score_pdf">Score PDF</option>
                      <option value="score_musicxml">MusicXML</option>
                      <option value="score_image">Score Bild</option>
                      <option value="lyrics_doc">Lyrics Datei</option>
                    </select>
                    <input name="file" type="file" />
                    <button type="submit" disabled={!isEditMode}>
                      Datei hochladen
                    </button>
                  </form>

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
                  <h3>Spotify</h3>
                  {selectedSong.spotifyUrl ? (
                    <a href={selectedSong.spotifyUrl} target="_blank" rel="noreferrer">
                      Song auf Spotify oeffnen
                    </a>
                  ) : (
                    <p>Noch kein Spotify Link eingetragen.</p>
                  )}
                </article>

                <article className="box">
                  <h3>Akkorde Render</h3>
                  <ChordRender chordProText={selectedSong.chordProText ?? ""} />
                </article>

                <article className="box">
                  <h3>Notenblatt Render</h3>
                  <SheetRender
                    musicXmlUrl={
                      selectedSong.attachments.find((att) => att.kind === "score_musicxml")?.fileUrl ?? null
                    }
                  />
                </article>
              </section>

              <section className="box discussion-box shell-comments">
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
                  {selectedSong.threads.map((thread) => (
                    <ThreadCard key={thread.id} thread={thread} onAddPost={addPost} />
                  ))}
                </div>
              </section>

              <section className="box">
                <h3>Band Einladungen</h3>
                <div className="thread-form">
                  <input
                    type="email"
                    placeholder="mitglied@email.de"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                  />
                  <button type="button" onClick={() => void createInvite()}>
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
                  {invites.map((invite) => (
                    <li key={invite.id}>
                      <span>{invite.email}</span>
                      <span>
                        {invite.acceptedAt
                          ? "angenommen"
                          : new Date(invite.expiresAt).getTime() < Date.now()
                            ? `abgelaufen (${new Date(invite.expiresAt).toLocaleDateString("de-DE")})`
                            : `gueltig bis ${new Date(invite.expiresAt).toLocaleDateString("de-DE")}`}
                      </span>
                      {!invite.acceptedAt ? (
                        <button type="button" className="ghost" onClick={() => void revokeInvite(invite.id)}>
                          Widerrufen
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>

              <section className="box">
                <h3>Kalender (offline-faehig)</h3>
                <ul className="calendar-list">
                  {events.map((event) => (
                    <li key={event.id}>
                      <strong>{event.title}</strong>
                      <span>{new Date(event.startsAt).toLocaleString("de-DE")}</span>
                      <span>{event.venueLabel ?? "Ort folgt"}</span>
                      <span>
                        Zusagen: {event.availabilitySummary?.availableCount ?? 0} | Vielleicht: {event.availabilitySummary?.maybeCount ?? 0} |
                        Absagen: {event.availabilitySummary?.unavailableCount ?? 0} | Offen: {event.availabilitySummary?.missingResponses ?? 0}
                      </span>
                      <span>{event.availabilitySummary?.hasConflict ? "Konflikt erkannt" : "Kein Konflikt"}</span>
                      <div>
                        <label>
                          Meine Verfuegbarkeit
                          <select
                            value={event.myAvailability?.status ?? "maybe"}
                            onChange={(e) => void updateAvailability(event.id, e.target.value as "available" | "maybe" | "unavailable")}
                          >
                            <option value="available">Verfuegbar</option>
                            <option value="maybe">Vielleicht</option>
                            <option value="unavailable">Nicht verfuegbar</option>
                          </select>
                        </label>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>

              {selectedSetlist ? (
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
                      }}
                    >
                      Reset
                    </button>
                  </div>

                  <div className="thread-list">
                    {rehearsalItems.map((item) => (
                      <div key={item.songId} className="thread-card">
                        <strong>
                          {item.position}. {item.song.title}
                        </strong>
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
                </section>
              ) : null}

              <section className="box">
                <h3>Audit Log</h3>
                <ul className="attachment-list">
                  {auditLogs.map((entry) => (
                    <li key={entry.id}>
                      <span>
                        {new Date(entry.createdAt).toLocaleString("de-DE")} - {entry.action} ({entry.entityType})
                      </span>
                      <span>{entry.actor?.displayName ?? entry.actor?.email ?? "system"}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </main>
      </div>

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
