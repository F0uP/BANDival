-- Notation, parts, stems, audio comments, ideas, protocols, finances, guests, 2FA, push, public band page (idempotent).

ALTER TYPE "MembershipRole" ADD VALUE IF NOT EXISTS 'guest';

ALTER TABLE "AppUser" ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMPTZ(6),
ADD COLUMN IF NOT EXISTS "ntfyTopicUrl" TEXT,
ADD COLUMN IF NOT EXISTS "totpEnabledAt" TIMESTAMPTZ(6),
ADD COLUMN IF NOT EXISTS "totpSecret" TEXT;

ALTER TABLE "Band" ADD COLUMN IF NOT EXISTS "bio" TEXT,
ADD COLUMN IF NOT EXISTS "city" TEXT,
ADD COLUMN IF NOT EXISTS "contactEmail" TEXT,
ADD COLUMN IF NOT EXISTS "genre" TEXT,
ADD COLUMN IF NOT EXISTS "links" JSONB,
ADD COLUMN IF NOT EXISTS "pressPhotoUrl" TEXT,
ADD COLUMN IF NOT EXISTS "publicEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "rider" JSONB;

ALTER TABLE "Song" ADD COLUMN IF NOT EXISTS "isPublic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "timeSignature" TEXT;

ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "contactEmail" TEXT,
ADD COLUMN IF NOT EXISTS "contactName" TEXT,
ADD COLUMN IF NOT EXISTS "contactPhone" TEXT,
ADD COLUMN IF NOT EXISTS "doorsAt" TIMESTAMPTZ(6),
ADD COLUMN IF NOT EXISTS "feeCents" INTEGER,
ADD COLUMN IF NOT EXISTS "feeStatus" TEXT,
ADD COLUMN IF NOT EXISTS "isPublic" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "loadInAt" TIMESTAMPTZ(6),
ADD COLUMN IF NOT EXISTS "soundcheckAt" TIMESTAMPTZ(6);

ALTER TABLE "BandInvite" ADD COLUMN IF NOT EXISTS "guestSetlistIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN IF NOT EXISTS "role" "MembershipRole" NOT NULL DEFAULT 'member';

ALTER TABLE "NotificationPreference" ADD COLUMN IF NOT EXISTS "digestEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "pushEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "remindersEnabled" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS "UserToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "usedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TwoFactorRecoveryCode" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TwoFactorRecoveryCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PushSubscription" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AppSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

CREATE TABLE IF NOT EXISTS "JobLog" (
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobLog_pkey" PRIMARY KEY ("key")
);

CREATE TABLE IF NOT EXISTS "GuestSetlistAccess" (
    "id" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "setlistId" UUID NOT NULL,

    CONSTRAINT "GuestSetlistAccess_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SongScore" (
    "id" UUID NOT NULL,
    "songId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "instrument" TEXT,
    "data" JSONB NOT NULL,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "SongScore_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SongPart" (
    "id" UUID NOT NULL,
    "songId" UUID NOT NULL,
    "instrument" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'chordpro',
    "content" TEXT NOT NULL,
    "updatedByUserId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "SongPart_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SongStem" (
    "id" UUID NOT NULL,
    "songId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT,
    "fileSizeBytes" BIGINT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SongStem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AudioComment" (
    "id" UUID NOT NULL,
    "audioVersionId" UUID NOT NULL,
    "userId" UUID,
    "atSeconds" DOUBLE PRECISION NOT NULL,
    "body" TEXT NOT NULL,
    "resolvedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AudioComment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Idea" (
    "id" UUID NOT NULL,
    "bandId" UUID NOT NULL,
    "createdByUserId" UUID,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "fileUrl" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "durationSeconds" INTEGER,
    "songId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Idea_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EventLog" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "notes" TEXT NOT NULL,
    "updatedByUserId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "EventLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EventLogSong" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "songId" UUID NOT NULL,
    "rating" INTEGER,
    "note" TEXT,

    CONSTRAINT "EventLogSong_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EventAttendance" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "present" BOOLEAN NOT NULL,

    CONSTRAINT "EventAttendance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "FinanceTransaction" (
    "id" UUID NOT NULL,
    "bandId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "eventId" UUID,
    "recurringId" UUID,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "FinanceTransaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RecurringTransaction" (
    "id" UUID NOT NULL,
    "bandId" UUID NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "dayOfMonth" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastRunMonth" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "RecurringTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserToken_tokenHash_key" ON "UserToken"("tokenHash");

CREATE INDEX IF NOT EXISTS "UserToken_userId_kind_idx" ON "UserToken"("userId", "kind");

CREATE INDEX IF NOT EXISTS "TwoFactorRecoveryCode_userId_idx" ON "TwoFactorRecoveryCode"("userId");

CREATE UNIQUE INDEX IF NOT EXISTS "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

CREATE INDEX IF NOT EXISTS "PushSubscription_userId_idx" ON "PushSubscription"("userId");

CREATE UNIQUE INDEX IF NOT EXISTS "GuestSetlistAccess_memberId_setlistId_key" ON "GuestSetlistAccess"("memberId", "setlistId");

CREATE INDEX IF NOT EXISTS "SongScore_songId_idx" ON "SongScore"("songId");

CREATE UNIQUE INDEX IF NOT EXISTS "SongPart_songId_instrument_key" ON "SongPart"("songId", "instrument");

CREATE INDEX IF NOT EXISTS "SongStem_songId_sortOrder_idx" ON "SongStem"("songId", "sortOrder");

CREATE INDEX IF NOT EXISTS "AudioComment_audioVersionId_atSeconds_idx" ON "AudioComment"("audioVersionId", "atSeconds");

CREATE INDEX IF NOT EXISTS "Idea_bandId_createdAt_idx" ON "Idea"("bandId", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "EventLog_eventId_key" ON "EventLog"("eventId");

CREATE INDEX IF NOT EXISTS "EventLogSong_songId_idx" ON "EventLogSong"("songId");

CREATE UNIQUE INDEX IF NOT EXISTS "EventLogSong_eventId_songId_key" ON "EventLogSong"("eventId", "songId");

CREATE UNIQUE INDEX IF NOT EXISTS "EventAttendance_eventId_userId_key" ON "EventAttendance"("eventId", "userId");

CREATE INDEX IF NOT EXISTS "FinanceTransaction_bandId_date_idx" ON "FinanceTransaction"("bandId", "date");

CREATE INDEX IF NOT EXISTS "RecurringTransaction_bandId_idx" ON "RecurringTransaction"("bandId");

DO $$ BEGIN
  ALTER TABLE "UserToken" ADD CONSTRAINT "UserToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TwoFactorRecoveryCode" ADD CONSTRAINT "TwoFactorRecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "GuestSetlistAccess" ADD CONSTRAINT "GuestSetlistAccess_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "BandMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "GuestSetlistAccess" ADD CONSTRAINT "GuestSetlistAccess_setlistId_fkey" FOREIGN KEY ("setlistId") REFERENCES "Setlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SongScore" ADD CONSTRAINT "SongScore_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SongScore" ADD CONSTRAINT "SongScore_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SongPart" ADD CONSTRAINT "SongPart_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SongPart" ADD CONSTRAINT "SongPart_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SongStem" ADD CONSTRAINT "SongStem_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AudioComment" ADD CONSTRAINT "AudioComment_audioVersionId_fkey" FOREIGN KEY ("audioVersionId") REFERENCES "SongAudioVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AudioComment" ADD CONSTRAINT "AudioComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Idea" ADD CONSTRAINT "Idea_bandId_fkey" FOREIGN KEY ("bandId") REFERENCES "Band"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Idea" ADD CONSTRAINT "Idea_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Idea" ADD CONSTRAINT "Idea_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "EventLog" ADD CONSTRAINT "EventLog_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "EventLog" ADD CONSTRAINT "EventLog_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "EventLogSong" ADD CONSTRAINT "EventLogSong_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "EventLogSong" ADD CONSTRAINT "EventLogSong_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "EventAttendance" ADD CONSTRAINT "EventAttendance_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "EventAttendance" ADD CONSTRAINT "EventAttendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "FinanceTransaction" ADD CONSTRAINT "FinanceTransaction_bandId_fkey" FOREIGN KEY ("bandId") REFERENCES "Band"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "FinanceTransaction" ADD CONSTRAINT "FinanceTransaction_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "FinanceTransaction" ADD CONSTRAINT "FinanceTransaction_recurringId_fkey" FOREIGN KEY ("recurringId") REFERENCES "RecurringTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "FinanceTransaction" ADD CONSTRAINT "FinanceTransaction_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "RecurringTransaction" ADD CONSTRAINT "RecurringTransaction_bandId_fkey" FOREIGN KEY ("bandId") REFERENCES "Band"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Accounts that existed before e-mail verification was introduced count as verified.
UPDATE "AppUser" SET "emailVerifiedAt" = "createdAt" WHERE "emailVerifiedAt" IS NULL;
