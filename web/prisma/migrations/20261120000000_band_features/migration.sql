-- Band features (idempotent): user language, invoice language, GEMA rights data, detected tempo/key,
-- public tech-rider links and tour planning.
ALTER TABLE "AppUser" ADD COLUMN IF NOT EXISTS "locale" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "language" TEXT NOT NULL DEFAULT 'de';
ALTER TABLE "Song" ADD COLUMN IF NOT EXISTS "composers" TEXT;
ALTER TABLE "Song" ADD COLUMN IF NOT EXISTS "lyricists" TEXT;
ALTER TABLE "Song" ADD COLUMN IF NOT EXISTS "publisher" TEXT;
ALTER TABLE "Song" ADD COLUMN IF NOT EXISTS "gemaWorkNumber" TEXT;
ALTER TABLE "SongAudioVersion" ADD COLUMN IF NOT EXISTS "detectedBpm" DOUBLE PRECISION;
ALTER TABLE "SongAudioVersion" ADD COLUMN IF NOT EXISTS "detectedKey" TEXT;
ALTER TABLE "Idea" ADD COLUMN IF NOT EXISTS "detectedBpm" DOUBLE PRECISION;
ALTER TABLE "Idea" ADD COLUMN IF NOT EXISTS "detectedKey" TEXT;

CREATE TABLE IF NOT EXISTS "Tour" (
  "id" UUID NOT NULL,
  "bandId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "startsOn" DATE NOT NULL,
  "endsOn" DATE NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "Tour_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Tour_bandId_startsOn_idx" ON "Tour"("bandId", "startsOn");

CREATE TABLE IF NOT EXISTS "TourItem" (
  "id" UUID NOT NULL,
  "tourId" UUID NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'note',
  "title" TEXT NOT NULL,
  "startsAt" TIMESTAMPTZ(6) NOT NULL,
  "endsAt" TIMESTAMPTZ(6),
  "location" TEXT,
  "toLocation" TEXT,
  "details" TEXT,
  "bookingRef" TEXT,
  "costCents" INTEGER,
  "distanceKm" INTEGER,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "TourItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TourItem_tourId_startsAt_idx" ON "TourItem"("tourId", "startsAt");

ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "tourId" UUID;
CREATE INDEX IF NOT EXISTS "Event_tourId_idx" ON "Event"("tourId");

CREATE TABLE IF NOT EXISTS "RiderShare" (
  "id" UUID NOT NULL,
  "token" TEXT NOT NULL,
  "bandId" UUID NOT NULL,
  "eventId" UUID,
  "createdByUserId" UUID,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ(6),
  "lastViewedAt" TIMESTAMPTZ(6),
  CONSTRAINT "RiderShare_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "RiderShare_token_key" ON "RiderShare"("token");
CREATE INDEX IF NOT EXISTS "RiderShare_bandId_idx" ON "RiderShare"("bandId");
CREATE INDEX IF NOT EXISTS "RiderShare_eventId_idx" ON "RiderShare"("eventId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Tour_bandId_fkey') THEN
    ALTER TABLE "Tour" ADD CONSTRAINT "Tour_bandId_fkey" FOREIGN KEY ("bandId") REFERENCES "Band"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TourItem_tourId_fkey') THEN
    ALTER TABLE "TourItem" ADD CONSTRAINT "TourItem_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Event_tourId_fkey') THEN
    ALTER TABLE "Event" ADD CONSTRAINT "Event_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RiderShare_bandId_fkey') THEN
    ALTER TABLE "RiderShare" ADD CONSTRAINT "RiderShare_bandId_fkey" FOREIGN KEY ("bandId") REFERENCES "Band"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RiderShare_eventId_fkey') THEN
    ALTER TABLE "RiderShare" ADD CONSTRAINT "RiderShare_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RiderShare_createdByUserId_fkey') THEN
    ALTER TABLE "RiderShare" ADD CONSTRAINT "RiderShare_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
