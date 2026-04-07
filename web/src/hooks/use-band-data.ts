import { useMemo } from "react";
import { useCalendarWorkspace } from "@/hooks/use-calendar-workspace";
import { useSongWorkspace } from "@/hooks/use-song-workspace";

type InviteLike = {
  id: string;
  email: string;
  acceptedAt: string | null;
  revokedAt?: string | null;
  expiresAt: string;
  createdAt: string;
};

type SetlistLike = {
  id: string;
  name: string;
  description: string | null;
  items: Array<{ id: string; position: number; song: { id: string; title: string } }>;
};

type AlbumLike = {
  id: string;
  title: string;
  coverUrl?: string | null;
  songs?: Array<{ id: string; title: string }>;
};

type SongLike = {
  id: string;
  title: string;
  notes: string | null;
  album?: { title: string } | null;
};

type BandPermissionsLike = {
  permissions: Record<string, boolean>;
};

export function useBandData<TSong extends SongLike, TSetlist extends SetlistLike, TAlbum extends AlbumLike>(args: {
  songs: TSong[];
  setlists: TSetlist[];
  albums: TAlbum[];
  events: Array<{ id: string; startsAt: string; title: string; venueLabel?: string | null }>;
  notifications: Array<{ readAt: string | null }>;
  invites: InviteLike[];
  inviteFilter: "all" | "open" | "expired" | "accepted" | "revoked";
  bandPermissions: BandPermissionsLike | null;
  selectedSongId: string | null;
  selectedSetlistId: string | null;
  selectedAlbumId: string | null;
  searchQuery: string;
  nowMs: number;
}) {
  const {
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
  } = args;

  const { selectedSong, filteredSongs } = useSongWorkspace({ songs, selectedSongId, searchQuery });
  const { unreadNotificationCount, nextEvent } = useCalendarWorkspace({ events, notifications, nowMs });

  const selectedSetlist = useMemo(
    () => setlists.find((setlist) => setlist.id === selectedSetlistId) ?? null,
    [setlists, selectedSetlistId],
  );

  const selectedAlbum = useMemo(
    () => albums.find((album) => album.id === selectedAlbumId) ?? null,
    [albums, selectedAlbumId],
  );

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

  const visibleInvites = useMemo(() => {
    return invites.filter((invite) => {
      if (inviteFilter === "all") {
        return true;
      }

      if (inviteFilter === "revoked") {
        return Boolean(invite.revokedAt);
      }

      if (inviteFilter === "accepted") {
        return !invite.revokedAt && Boolean(invite.acceptedAt);
      }

      if (inviteFilter === "expired") {
        return !invite.revokedAt && !invite.acceptedAt && new Date(invite.expiresAt).getTime() <= nowMs;
      }

      return !invite.revokedAt && !invite.acceptedAt && new Date(invite.expiresAt).getTime() > nowMs;
    });
  }, [invites, inviteFilter, nowMs]);

  const deniedActions = useMemo(
    () =>
      bandPermissions
        ? Object.entries(bandPermissions.permissions)
            .filter(([, allowed]) => !allowed)
            .map(([action]) => action)
        : [],
    [bandPermissions],
  );

  return {
    selectedSong,
    selectedSetlist,
    selectedAlbum,
    filteredSongs,
    filteredSetlists,
    visibleInvites,
    deniedActions,
    unreadNotificationCount,
    nextEvent,
  };
}
