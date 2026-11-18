"use client";

import useSWR, { type SWRConfiguration } from "swr";
import useSWRInfinite from "swr/infinite";
import type {
  Album,
  AppNotification,
  AuditEntry,
  BandEvent,
  BandMember,
  CalendarOverview,
  CalendarSource,
  DateSuggestion,
  Invite,
  MemberInfo,
  NotificationPreference,
  Setlist,
  AudioComment,
  SongDetail,
  SongListItem,
  SongPart,
  SongScoreRecord,
  SongStem,
  Task,
} from "@/lib/client/types";

const key = (condition: unknown, url: string) => (condition ? url : null);

export function useSongs(bandId: string | null) {
  return useSWR<{ songs: SongListItem[] }>(key(bandId, `/api/songs?bandId=${bandId}`));
}

export function useSong(songId: string | null) {
  return useSWR<{ song: SongDetail }>(key(songId, `/api/songs/${songId}`));
}

export function useSongScores(songId: string | null) {
  return useSWR<{ scores: SongScoreRecord[] }>(key(songId, `/api/songs/${songId}/scores`));
}

export function useSongScore(songId: string | null, scoreId: string | null) {
  return useSWR<{ score: SongScoreRecord }>(key(songId && scoreId, `/api/songs/${songId}/scores/${scoreId}`), { revalidateOnFocus: false });
}

export function useSongParts(songId: string | null) {
  return useSWR<{ parts: SongPart[] }>(key(songId, `/api/songs/${songId}/parts`));
}

export function useSongStems(songId: string | null) {
  return useSWR<{ stems: SongStem[] }>(key(songId, `/api/songs/${songId}/stems`));
}

export function useAudioComments(songId: string | null, audioId: string | null) {
  return useSWR<{ comments: AudioComment[] }>(key(songId && audioId, `/api/songs/${songId}/audio/${audioId}/comments`));
}

export function useAlbums(bandId: string | null) {
  return useSWR<{ albums: Album[] }>(key(bandId, `/api/albums?bandId=${bandId}`));
}

export function useAlbum(albumId: string | null) {
  return useSWR<{ album: Album }>(key(albumId, `/api/albums/${albumId}`));
}

export function useSetlists(bandId: string | null) {
  return useSWR<{ setlists: Setlist[] }>(key(bandId, `/api/setlists?bandId=${bandId}`));
}

export function useSetlist(setlistId: string | null, config?: SWRConfiguration) {
  return useSWR<{ setlist: Setlist }>(key(setlistId, `/api/setlists/${setlistId}`), config);
}

export function useRehearsalNotes(setlistId: string | null) {
  return useSWR<{ notes: Array<{ songId: string; note: string; updatedAt: string; updatedBy: { displayName: string } | null }> }>(
    key(setlistId, `/api/setlists/${setlistId}/rehearsal`),
  );
}

export function useUpcomingEvents(bandId: string | null, limit = 8) {
  return useSWR<{ events: BandEvent[] }>(key(bandId, `/api/events?bandId=${bandId}&upcoming=1&limit=${limit}`));
}

export function useCalendarOverview(bandId: string | null, from: string, to: string) {
  return useSWR<CalendarOverview>(key(bandId, `/api/calendar/overview?bandId=${bandId}&from=${from}&to=${to}`), {
    keepPreviousData: true,
  });
}

export function useDateSuggestions(bandId: string | null, params: URLSearchParams | null) {
  return useSWR<{ suggestions: DateSuggestion[]; members: MemberInfo[]; from: string; to: string }>(
    key(bandId && params, `/api/calendar/suggestions?bandId=${bandId}&${params?.toString()}`),
  );
}

export function useCalendarSources(enabled = true) {
  return useSWR<{ sources: CalendarSource[] }>(key(enabled, "/api/calendar/sources"));
}

export function useFeedLink(bandId: string | null) {
  return useSWR<{ url: string; webcalUrl: string }>(key(bandId, `/api/calendar/feed-link?bandId=${bandId}`));
}

export function useMembers(bandId: string | null) {
  return useSWR<{ members: BandMember[] }>(key(bandId, `/api/bands/${bandId}/members`));
}

export function useInvites(bandId: string | null, enabled: boolean) {
  return useSWR<{ invites: Invite[] }>(key(bandId && enabled, `/api/bands/${bandId}/invites?status=all`));
}

export function useTasks(bandId: string | null, filter: { songId?: string; setlistId?: string; status?: string } = {}) {
  const params = new URLSearchParams({ bandId: bandId ?? "" });
  if (filter.songId) params.set("songId", filter.songId);
  if (filter.setlistId) params.set("setlistId", filter.setlistId);
  if (filter.status) params.set("status", filter.status);
  return useSWR<{ tasks: Task[] }>(key(bandId, `/api/boards/tasks?${params.toString()}`));
}

export function useNotifications() {
  return useSWR<{ notifications: AppNotification[]; unreadCount: number }>("/api/notifications?limit=40", {
    refreshInterval: 60_000,
  });
}

export function useNotificationPreferences(bandId: string | null) {
  return useSWR<{ preference: NotificationPreference; emailAvailable: boolean }>(
    key(bandId, `/api/bands/${bandId}/notification-preferences`),
  );
}

export function useBandDetails(bandId: string | null) {
  return useSWR<{ band: { id: string; name: string; description: string | null; timezone: string; stats: { songs: number; setlists: number; members: number } } }>(
    key(bandId, `/api/bands/${bandId}`),
  );
}

const AUDIT_PAGE = 40;

export function useAuditLog(bandId: string | null, entityType: string | null) {
  return useSWRInfinite<{ logs: AuditEntry[]; hasMore: boolean }>(
    (index, previous) => {
      if (!bandId) return null;
      if (previous && !previous.hasMore) return null;
      const params = new URLSearchParams({ limit: String(AUDIT_PAGE) });
      if (entityType) params.set("entityType", entityType);
      const last = previous?.logs.at(-1);
      if (index > 0 && last) params.set("before", last.createdAt);
      return `/api/bands/${bandId}/audit?${params.toString()}`;
    },
  );
}

export type AiStatus = { enabled: boolean; provider: "openai" | "gemini" | "ollama" | null; model: string | null; transcription: boolean; stemSeparation: boolean; external: boolean };

export function useAiStatus() {
  return useSWR<AiStatus>("/api/ai/status", { revalidateOnFocus: false, dedupingInterval: 300_000 });
}
