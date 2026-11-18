-- Calendar sync, personal day availability, event kinds, setlist metadata (idempotent).

DO $$ BEGIN
  CREATE TYPE "EventKind" AS ENUM ('rehearsal', 'gig', 'meeting', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CalendarSourceKind" AS ENUM ('ics_url', 'ics_file');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Band" ADD COLUMN IF NOT EXISTS "timezone" TEXT NOT NULL DEFAULT 'Europe/Berlin';

ALTER TABLE "BandMember" ADD COLUMN IF NOT EXISTS "calendarFeedVersion" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "Setlist" ADD COLUMN IF NOT EXISTS "equipment" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN IF NOT EXISTS "instruments" TEXT[] DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "kind" "EventKind" NOT NULL DEFAULT 'rehearsal',
ADD COLUMN IF NOT EXISTS "setlistId" UUID;

CREATE TABLE IF NOT EXISTS "UserDayAvailability" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "status" "AvailabilityStatus" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "UserDayAvailability_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CalendarSource" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "kind" "CalendarSourceKind" NOT NULL,
    "url" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMPTZ(6),
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "CalendarSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CalendarBusyBlock" (
    "id" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "startsAt" TIMESTAMPTZ(6) NOT NULL,
    "endsAt" TIMESTAMPTZ(6) NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "title" TEXT,

    CONSTRAINT "CalendarBusyBlock_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "UserDayAvailability_date_idx" ON "UserDayAvailability"("date");

CREATE UNIQUE INDEX IF NOT EXISTS "UserDayAvailability_userId_date_key" ON "UserDayAvailability"("userId", "date");

CREATE INDEX IF NOT EXISTS "CalendarSource_userId_idx" ON "CalendarSource"("userId");

CREATE INDEX IF NOT EXISTS "CalendarBusyBlock_userId_startsAt_idx" ON "CalendarBusyBlock"("userId", "startsAt");

CREATE INDEX IF NOT EXISTS "CalendarBusyBlock_sourceId_idx" ON "CalendarBusyBlock"("sourceId");

CREATE INDEX IF NOT EXISTS "Song_bandId_updatedAt_idx" ON "Song"("bandId", "updatedAt");

DO $$ BEGIN
  ALTER TABLE "Event" ADD CONSTRAINT "Event_setlistId_fkey" FOREIGN KEY ("setlistId") REFERENCES "Setlist"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "UserDayAvailability" ADD CONSTRAINT "UserDayAvailability_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CalendarSource" ADD CONSTRAINT "CalendarSource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CalendarBusyBlock" ADD CONSTRAINT "CalendarBusyBlock_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "CalendarSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CalendarBusyBlock" ADD CONSTRAINT "CalendarBusyBlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Data migrations
-- ---------------------------------------------------------------------------

-- Day availability used to be stored as hidden "availability_template" events.
-- It is now personal (band-independent) and lives in "UserDayAvailability".
INSERT INTO "UserDayAvailability" ("id", "userId", "date", "status", "note", "createdAt", "updatedAt")
SELECT DISTINCT ON (ea."userId", (e."startsAt" AT TIME ZONE 'UTC')::date)
  gen_random_uuid(),
  ea."userId",
  (e."startsAt" AT TIME ZONE 'UTC')::date,
  ea."status",
  ea."note",
  ea."createdAt",
  ea."updatedAt"
FROM "EventAvailability" ea
JOIN "Event" e ON e."id" = ea."eventId"
WHERE e."status" = 'availability_template'
ORDER BY ea."userId", (e."startsAt" AT TIME ZONE 'UTC')::date, ea."updatedAt" DESC
ON CONFLICT ("userId", "date") DO NOTHING;

DELETE FROM "Event" WHERE "status" = 'availability_template';

-- Setlist instruments/equipment used to be JSON appended to the description.
DO $$
DECLARE
  r RECORD;
  meta JSONB;
BEGIN
  FOR r IN SELECT "id", "description" FROM "Setlist" WHERE "description" LIKE '%[bandival-meta]%' LOOP
    BEGIN
      meta := btrim(split_part(r."description", '[bandival-meta]', 2), E' \t\r\n')::jsonb;
      UPDATE "Setlist" SET
        "instruments" = COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(meta -> 'instruments', '[]'::jsonb))), ARRAY[]::TEXT[]),
        "equipment" = COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(meta -> 'equipment', '[]'::jsonb))), ARRAY[]::TEXT[]),
        "description" = NULLIF(btrim(split_part(r."description", '[bandival-meta]', 1), E' \t\r\n'), '')
      WHERE "id" = r."id";
    EXCEPTION WHEN others THEN
      NULL; -- keep malformed descriptions untouched
    END;
  END LOOP;
END $$;

-- Song workflow status used to be encoded as a "[workflow:x]" prefix in the notes.
UPDATE "Song"
SET
  "workflowStatus" = substring(lower("notes") FROM '^\[workflow:(draft|review|approved|archived)\]')::"SongWorkflowStatus",
  "notes" = NULLIF(regexp_replace("notes", '^\[workflow:(draft|review|approved|archived)\]\n?', '', 'i'), '')
WHERE lower("notes") ~ '^\[workflow:(draft|review|approved|archived)\]';

-- Best-effort classification of existing events.
UPDATE "Event" SET "kind" = 'gig'
WHERE "kind" = 'rehearsal' AND "title" ~* '(gig|konzert|auftritt|show|festival|concert)';
