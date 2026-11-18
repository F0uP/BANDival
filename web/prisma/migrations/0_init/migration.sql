-- Baseline of the Bandival schema (idempotent).
-- Safe to run on fresh databases and on databases created earlier via `prisma db push`.

DO $$ BEGIN
  CREATE TYPE "MembershipRole" AS ENUM ('owner', 'admin', 'member');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SongVisibility" AS ENUM ('band', 'private_draft');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SongWorkflowStatus" AS ENUM ('draft', 'review', 'approved', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "KanbanTaskStatus" AS ENUM ('open', 'in_progress', 'done');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AttachmentKind" AS ENUM ('lead_sheet', 'score_pdf', 'score_musicxml', 'score_image', 'lyrics_doc', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ThreadTargetType" AS ENUM ('band', 'song', 'event');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AvailabilityStatus" AS ENUM ('available', 'maybe', 'unavailable');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "AppUser" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "displayName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "AppUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AuthSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "sessionHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "lastActivityAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(6),
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AuthRateLimit" (
    "key" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMPTZ(6) NOT NULL,
    "blockedUntil" TIMESTAMPTZ(6),
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "AuthRateLimit_pkey" PRIMARY KEY ("key")
);

CREATE TABLE IF NOT EXISTS "Band" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Band_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BandMember" (
    "id" UUID NOT NULL,
    "bandId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'member',
    "instrumentPrimary" TEXT,
    "joinedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BandMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Song" (
    "id" UUID NOT NULL,
    "bandId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "workflowStatus" "SongWorkflowStatus" NOT NULL DEFAULT 'draft',
    "keySignature" TEXT,
    "tempoBpm" DECIMAL(6,2),
    "durationSeconds" INTEGER,
    "spotifyUrl" TEXT,
    "visibility" "SongVisibility" NOT NULL DEFAULT 'band',
    "notes" TEXT,
    "chordProText" TEXT,
    "albumId" UUID,
    "albumTrackNo" INTEGER,
    "createdBy" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Song_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "KanbanTask" (
    "id" UUID NOT NULL,
    "bandId" UUID NOT NULL,
    "setlistId" UUID,
    "songId" UUID,
    "title" TEXT NOT NULL,
    "status" "KanbanTaskStatus" NOT NULL DEFAULT 'open',
    "updatedByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "KanbanTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Album" (
    "id" UUID NOT NULL,
    "bandId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "coverUrl" TEXT,
    "releaseDate" TIMESTAMP(3),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Album_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SongLyricsRevision" (
    "id" UUID NOT NULL,
    "songId" UUID NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "title" TEXT,
    "lyricsMarkdown" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SongLyricsRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SongAudioVersion" (
    "id" UUID NOT NULL,
    "songId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'audio/mpeg',
    "durationSeconds" INTEGER,
    "uploadedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SongAudioVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SongAttachment" (
    "id" UUID NOT NULL,
    "songId" UUID NOT NULL,
    "kind" "AttachmentKind" NOT NULL DEFAULT 'other',
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT,
    "fileSizeBytes" BIGINT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SongAttachment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DiscussionThread" (
    "id" UUID NOT NULL,
    "songId" UUID NOT NULL,
    "createdByUserId" UUID,
    "title" TEXT NOT NULL,
    "targetType" "ThreadTargetType" NOT NULL DEFAULT 'song',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "DiscussionThread_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DiscussionPost" (
    "id" UUID NOT NULL,
    "threadId" UUID NOT NULL,
    "createdByUserId" UUID,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscussionPost_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Setlist" (
    "id" UUID NOT NULL,
    "bandId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "copiedFromSetlistId" UUID,
    "coverImageUrl" TEXT,
    "pdfExportUrl" TEXT,
    "estimatedTotalSeconds" INTEGER,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Setlist_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SetlistRehearsalTask" (
    "id" UUID NOT NULL,
    "setlistId" UUID NOT NULL,
    "songId" UUID,
    "title" TEXT NOT NULL,
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "assigneeUserId" UUID,
    "dueAt" TIMESTAMPTZ(6),
    "updatedByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "SetlistRehearsalTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Event" (
    "id" UUID NOT NULL,
    "bandId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(6) NOT NULL,
    "endsAt" TIMESTAMPTZ(6),
    "recurrenceGroupId" UUID,
    "recurrenceEveryDays" INTEGER,
    "recurrenceCount" INTEGER,
    "venueLabel" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EventAvailability" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "AvailabilityStatus" NOT NULL DEFAULT 'maybe',
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "EventAvailability_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SetlistItem" (
    "id" UUID NOT NULL,
    "setlistId" UUID NOT NULL,
    "songId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "transitionNotes" TEXT,
    "customKeySignature" TEXT,
    "customTempoBpm" DECIMAL(6,2),
    "customDurationSeconds" INTEGER,

    CONSTRAINT "SetlistItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SetlistRehearsalNote" (
    "id" UUID NOT NULL,
    "setlistId" UUID NOT NULL,
    "songId" UUID NOT NULL,
    "note" TEXT NOT NULL,
    "updatedByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "SetlistRehearsalNote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BandInvite" (
    "id" UUID NOT NULL,
    "bandId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "invitedByUserId" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "acceptedAt" TIMESTAMPTZ(6),
    "revokedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BandInvite_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" UUID NOT NULL,
    "bandId" UUID NOT NULL,
    "actorUserId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "bandId" UUID,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "payload" JSONB,
    "readAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "NotificationPreference" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "bandId" UUID NOT NULL,
    "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
    "notifyInvites" BOOLEAN NOT NULL DEFAULT true,
    "notifyEvents" BOOLEAN NOT NULL DEFAULT true,
    "notifySetlists" BOOLEAN NOT NULL DEFAULT true,
    "notifySongs" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AppUser_email_key" ON "AppUser"("email");

CREATE UNIQUE INDEX IF NOT EXISTS "AuthSession_sessionHash_key" ON "AuthSession"("sessionHash");

CREATE INDEX IF NOT EXISTS "AuthSession_userId_expiresAt_idx" ON "AuthSession"("userId", "expiresAt");

CREATE INDEX IF NOT EXISTS "AuthSession_expiresAt_revokedAt_idx" ON "AuthSession"("expiresAt", "revokedAt");

CREATE INDEX IF NOT EXISTS "AuthRateLimit_blockedUntil_idx" ON "AuthRateLimit"("blockedUntil");

CREATE UNIQUE INDEX IF NOT EXISTS "Band_slug_key" ON "Band"("slug");

CREATE UNIQUE INDEX IF NOT EXISTS "BandMember_bandId_userId_key" ON "BandMember"("bandId", "userId");

CREATE INDEX IF NOT EXISTS "Song_albumId_albumTrackNo_idx" ON "Song"("albumId", "albumTrackNo");

CREATE INDEX IF NOT EXISTS "KanbanTask_bandId_status_idx" ON "KanbanTask"("bandId", "status");

CREATE INDEX IF NOT EXISTS "KanbanTask_setlistId_status_idx" ON "KanbanTask"("setlistId", "status");

CREATE INDEX IF NOT EXISTS "KanbanTask_songId_status_idx" ON "KanbanTask"("songId", "status");

CREATE INDEX IF NOT EXISTS "Album_bandId_updatedAt_idx" ON "Album"("bandId", "updatedAt");

CREATE INDEX IF NOT EXISTS "SongLyricsRevision_songId_isCurrent_idx" ON "SongLyricsRevision"("songId", "isCurrent");

CREATE UNIQUE INDEX IF NOT EXISTS "SongLyricsRevision_songId_revisionNumber_key" ON "SongLyricsRevision"("songId", "revisionNumber");

CREATE INDEX IF NOT EXISTS "SongAudioVersion_songId_isCurrent_idx" ON "SongAudioVersion"("songId", "isCurrent");

CREATE UNIQUE INDEX IF NOT EXISTS "SongAudioVersion_songId_versionNumber_key" ON "SongAudioVersion"("songId", "versionNumber");

CREATE INDEX IF NOT EXISTS "SongAttachment_songId_createdAt_idx" ON "SongAttachment"("songId", "createdAt");

CREATE INDEX IF NOT EXISTS "DiscussionThread_songId_updatedAt_idx" ON "DiscussionThread"("songId", "updatedAt");

CREATE INDEX IF NOT EXISTS "DiscussionThread_createdByUserId_createdAt_idx" ON "DiscussionThread"("createdByUserId", "createdAt");

CREATE INDEX IF NOT EXISTS "DiscussionPost_threadId_createdAt_idx" ON "DiscussionPost"("threadId", "createdAt");

CREATE INDEX IF NOT EXISTS "DiscussionPost_createdByUserId_createdAt_idx" ON "DiscussionPost"("createdByUserId", "createdAt");

CREATE INDEX IF NOT EXISTS "Setlist_bandId_updatedAt_idx" ON "Setlist"("bandId", "updatedAt");

CREATE INDEX IF NOT EXISTS "SetlistRehearsalTask_setlistId_isDone_idx" ON "SetlistRehearsalTask"("setlistId", "isDone");

CREATE INDEX IF NOT EXISTS "SetlistRehearsalTask_dueAt_idx" ON "SetlistRehearsalTask"("dueAt");

CREATE INDEX IF NOT EXISTS "Event_bandId_startsAt_idx" ON "Event"("bandId", "startsAt");

CREATE INDEX IF NOT EXISTS "Event_recurrenceGroupId_idx" ON "Event"("recurrenceGroupId");

CREATE INDEX IF NOT EXISTS "EventAvailability_eventId_status_idx" ON "EventAvailability"("eventId", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "EventAvailability_eventId_userId_key" ON "EventAvailability"("eventId", "userId");

CREATE INDEX IF NOT EXISTS "SetlistItem_songId_idx" ON "SetlistItem"("songId");

CREATE UNIQUE INDEX IF NOT EXISTS "SetlistItem_setlistId_position_key" ON "SetlistItem"("setlistId", "position");

CREATE INDEX IF NOT EXISTS "SetlistRehearsalNote_setlistId_updatedAt_idx" ON "SetlistRehearsalNote"("setlistId", "updatedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "SetlistRehearsalNote_setlistId_songId_key" ON "SetlistRehearsalNote"("setlistId", "songId");

CREATE UNIQUE INDEX IF NOT EXISTS "BandInvite_tokenHash_key" ON "BandInvite"("tokenHash");

CREATE INDEX IF NOT EXISTS "BandInvite_bandId_expiresAt_idx" ON "BandInvite"("bandId", "expiresAt");

CREATE INDEX IF NOT EXISTS "BandInvite_email_acceptedAt_idx" ON "BandInvite"("email", "acceptedAt");

CREATE INDEX IF NOT EXISTS "AuditLog_bandId_createdAt_idx" ON "AuditLog"("bandId", "createdAt");

CREATE INDEX IF NOT EXISTS "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "Notification_bandId_createdAt_idx" ON "Notification"("bandId", "createdAt");

CREATE INDEX IF NOT EXISTS "NotificationPreference_bandId_idx" ON "NotificationPreference"("bandId");

CREATE UNIQUE INDEX IF NOT EXISTS "NotificationPreference_userId_bandId_key" ON "NotificationPreference"("userId", "bandId");

DO $$ BEGIN
  ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BandMember" ADD CONSTRAINT "BandMember_bandId_fkey" FOREIGN KEY ("bandId") REFERENCES "Band"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BandMember" ADD CONSTRAINT "BandMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Song" ADD CONSTRAINT "Song_bandId_fkey" FOREIGN KEY ("bandId") REFERENCES "Band"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Song" ADD CONSTRAINT "Song_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Song" ADD CONSTRAINT "Song_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "Album"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "KanbanTask" ADD CONSTRAINT "KanbanTask_bandId_fkey" FOREIGN KEY ("bandId") REFERENCES "Band"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "KanbanTask" ADD CONSTRAINT "KanbanTask_setlistId_fkey" FOREIGN KEY ("setlistId") REFERENCES "Setlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "KanbanTask" ADD CONSTRAINT "KanbanTask_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "KanbanTask" ADD CONSTRAINT "KanbanTask_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Album" ADD CONSTRAINT "Album_bandId_fkey" FOREIGN KEY ("bandId") REFERENCES "Band"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SongLyricsRevision" ADD CONSTRAINT "SongLyricsRevision_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SongAudioVersion" ADD CONSTRAINT "SongAudioVersion_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SongAttachment" ADD CONSTRAINT "SongAttachment_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "DiscussionThread" ADD CONSTRAINT "DiscussionThread_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "DiscussionThread" ADD CONSTRAINT "DiscussionThread_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "DiscussionPost" ADD CONSTRAINT "DiscussionPost_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "DiscussionThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "DiscussionPost" ADD CONSTRAINT "DiscussionPost_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Setlist" ADD CONSTRAINT "Setlist_bandId_fkey" FOREIGN KEY ("bandId") REFERENCES "Band"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SetlistRehearsalTask" ADD CONSTRAINT "SetlistRehearsalTask_setlistId_fkey" FOREIGN KEY ("setlistId") REFERENCES "Setlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SetlistRehearsalTask" ADD CONSTRAINT "SetlistRehearsalTask_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SetlistRehearsalTask" ADD CONSTRAINT "SetlistRehearsalTask_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SetlistRehearsalTask" ADD CONSTRAINT "SetlistRehearsalTask_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Event" ADD CONSTRAINT "Event_bandId_fkey" FOREIGN KEY ("bandId") REFERENCES "Band"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "EventAvailability" ADD CONSTRAINT "EventAvailability_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "EventAvailability" ADD CONSTRAINT "EventAvailability_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SetlistItem" ADD CONSTRAINT "SetlistItem_setlistId_fkey" FOREIGN KEY ("setlistId") REFERENCES "Setlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SetlistItem" ADD CONSTRAINT "SetlistItem_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SetlistRehearsalNote" ADD CONSTRAINT "SetlistRehearsalNote_setlistId_fkey" FOREIGN KEY ("setlistId") REFERENCES "Setlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SetlistRehearsalNote" ADD CONSTRAINT "SetlistRehearsalNote_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SetlistRehearsalNote" ADD CONSTRAINT "SetlistRehearsalNote_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BandInvite" ADD CONSTRAINT "BandInvite_bandId_fkey" FOREIGN KEY ("bandId") REFERENCES "Band"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BandInvite" ADD CONSTRAINT "BandInvite_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_bandId_fkey" FOREIGN KEY ("bandId") REFERENCES "Band"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
