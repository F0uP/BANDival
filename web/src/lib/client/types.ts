import type { BandRole } from "@/lib/permissions";

export type { BandRole };

export type AvailabilityStatus = "available" | "maybe" | "unavailable";
export type AvailabilitySource = "event" | "calendar" | "day" | null;
export type SongStatus = "draft" | "review" | "approved" | "archived";
export type EventKind = "rehearsal" | "gig" | "meeting" | "other";
export type EventStatus = "planned" | "confirmed" | "cancelled";
export type TaskStatus = "open" | "in_progress" | "done";
export type AttachmentKind = "lead_sheet" | "score_pdf" | "score_musicxml" | "score_image" | "lyrics_doc" | "other";

export type BandSummary = {
  id: string;
  name: string;
  timezone: string;
  role: BandRole;
  instrument: string | null;
};

export type Me = {
  userId: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  defaultBandId: string | null;
  emailVerified: boolean;
  /** Mail delivery is configured and the address is not confirmed yet – the app stays locked. */
  emailVerificationRequired?: boolean;
  twoFactorEnabled: boolean;
  ntfyTopicUrl: string | null;
  bands: BandSummary[];
};

export type Person = {
  id: string;
  displayName: string | null;
  email?: string;
  avatarUrl: string | null;
};

export type SongListItem = {
  id: string;
  title: string;
  workflowStatus: SongStatus;
  keySignature: string | null;
  tempoBpm: string | number | null;
  durationSeconds: number | null;
  timeSignature: string | null;
  isPublic: boolean;
  spotifyUrl: string | null;
  albumId: string | null;
  albumTrackNo: number | null;
  createdAt: string;
  updatedAt: string;
  album: { id: string; title: string; coverUrl: string | null } | null;
  audioVersions: Array<{ id: string; fileUrl: string; fileName: string }>;
  _count: { audioVersions: number; attachments: number; threads: number; setlistItems: number };
};

export type AudioVersion = {
  id: string;
  versionNumber: number;
  fileUrl: string;
  fileName: string;
  mimeType: string;
  durationSeconds: number | null;
  uploadedAt: string;
  isCurrent: boolean;
};

export type Attachment = {
  id: string;
  kind: AttachmentKind;
  fileUrl: string;
  fileName: string;
  mimeType: string | null;
  fileSizeBytes: string | null;
  createdAt: string;
};

export type DiscussionPost = {
  id: string;
  body: string;
  createdAt: string;
  createdBy: Person | null;
};

export type DiscussionThread = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  createdBy: Person | null;
  posts: DiscussionPost[];
};

export type SongDetail = Omit<SongListItem, "audioVersions" | "_count"> & {
  /** Revision for git-like merging – sent back as `baseRevision` when saving. */
  revision?: number;
  notes: string | null;
  chordProText: string | null;
  creator: { id: string; displayName: string } | null;
  audioVersions: AudioVersion[];
  attachments: Attachment[];
  lyricsRevisions: Array<{ id: string; lyricsMarkdown: string; revisionNumber: number }>;
  threads: DiscussionThread[];
  setlistItems: Array<{ setlist: { id: string; name: string } }>;
  _count: { lyricsRevisions: number };
};

export type SongScoreRecord = {
  revision?: number;
  id: string;
  songId: string;
  title: string;
  instrument: string | null;
  data: unknown;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; displayName: string } | null;
};

export type SongPart = {
  id: string;
  revision?: number;
  instrument: string;
  kind: "chordpro" | "text" | "tab";
  content: string;
  updatedAt: string;
  updatedBy: { id: string; displayName: string } | null;
};

export type SongStem = {
  id: string;
  label: string;
  fileUrl: string;
  fileName: string;
  sortOrder: number;
};

export type AudioComment = {
  id: string;
  atSeconds: number;
  body: string;
  resolvedAt: string | null;
  createdAt: string;
  user: { id: string; displayName: string; avatarUrl: string | null } | null;
};

export type AlbumSong = {
  id: string;
  title: string;
  albumTrackNo: number | null;
  durationSeconds: number | null;
  keySignature: string | null;
  tempoBpm: string | number | null;
  workflowStatus: SongStatus;
};

export type Album = {
  id: string;
  title: string;
  coverUrl: string | null;
  releaseDate: string | null;
  songs: AlbumSong[];
};

export type SetlistItem = {
  id: string;
  position: number;
  songId: string;
  transitionNotes: string | null;
  customKeySignature: string | null;
  customDurationSeconds: number | null;
  song: {
    id: string;
    title: string;
    keySignature: string | null;
    tempoBpm: string | number | null;
    durationSeconds: number | null;
    timeSignature?: string | null;
    workflowStatus: SongStatus;
    audioVersions: Array<{ id: string; fileUrl: string; fileName: string }>;
  };
};

export type Setlist = {
  id: string;
  revision?: number;
  name: string;
  description: string | null;
  instruments: string[];
  equipment: string[];
  updatedAt: string;
  createdAt: string;
  totalSeconds: number;
  items: SetlistItem[];
  events: Array<{ id: string; title: string; startsAt: string; kind: EventKind; venueLabel: string | null }>;
};

export type ResolvedAvailability = {
  status: AvailabilityStatus | null;
  source: AvailabilitySource;
  note?: string | null;
};

export type AvailabilitySummary = {
  available: number;
  maybe: number;
  unavailable: number;
  unknown: number;
  total: number;
};

export type BandEvent = {
  id: string;
  bandId: string;
  title: string;
  kind: EventKind;
  startsAt: string;
  endsAt: string | null;
  venueLabel: string | null;
  notes: string | null;
  status: EventStatus;
  setlistId: string | null;
  setlist: { id: string; name: string } | null;
  recurrenceGroupId: string | null;
  availability: {
    mine: ResolvedAvailability;
    members: Array<ResolvedAvailability & { userId: string }>;
    summary: AvailabilitySummary;
    hasConflict: boolean;
  };
};

export type MemberInfo = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  instrument: string | null;
  role: BandRole;
};

export type DayAvailability = ResolvedAvailability & { partial: boolean };

export type CalendarOverview = {
  timezone: string;
  members: MemberInfo[];
  days: Record<string, {
    mine: DayAvailability;
    members: Record<string, DayAvailability>;
    summary: AvailabilitySummary;
    partialCount: number;
  }>;
  myBusy: Record<string, Array<{ start: string; end: string; allDay: boolean; title: string | null }>>;
  events: BandEvent[];
  sync: { sources: number; lastSyncedAt: string | null; hasErrors: boolean; stale: boolean };
};

export type CalendarSource = {
  id: string;
  label: string;
  kind: "ics_url" | "ics_file";
  enabled: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
  createdAt: string;
  urlHint: string | null;
  _count: { blocks: number };
};

export type DateSuggestion = {
  date: string;
  start: string;
  end: string;
  available: number;
  maybe: number;
  unknown: number;
  blocked: number;
  total: number;
  score: number;
  blockedMembers: string[];
  hasBandEvent: boolean;
};

export type BandMember = {
  id: string;
  userId: string;
  role: BandRole;
  instrumentPrimary: string | null;
  joinedAt: string;
  user: { id: string; email: string; displayName: string; avatarUrl: string | null };
  guestSetlists?: Array<{ setlistId: string }>;
};

export type Invite = {
  id: string;
  email: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export type Task = {
  id: string;
  title: string;
  status: TaskStatus;
  songId: string | null;
  setlistId: string | null;
  createdAt: string;
  updatedAt: string;
  song: { id: string; title: string } | null;
  setlist: { id: string; name: string } | null;
  updatedBy: { id: string; displayName: string } | null;
};

export type AppNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  payload: { songId?: string; setlistId?: string; eventId?: string } | null;
  readAt: string | null;
  createdAt: string;
};

export type AuditEntry = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
  actor: Person | null;
};

export type NotificationPreference = {
  inAppEnabled: boolean;
  emailEnabled: boolean;
  notifyInvites: boolean;
  notifyEvents: boolean;
  notifySetlists: boolean;
  notifySongs: boolean;
  pushEnabled: boolean;
  remindersEnabled: boolean;
  digestEnabled: boolean;
};
