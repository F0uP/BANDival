-- Optional AI/ML background jobs (idempotent)
CREATE TABLE IF NOT EXISTS "AiJob" (
    "id" UUID NOT NULL,
    "bandId" UUID NOT NULL,
    "userId" UUID,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "songId" UUID,
    "audioVersionId" UUID,
    "externalId" TEXT,
    "error" TEXT,
    "result" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "AiJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AiJob_status_idx" ON "AiJob"("status");
CREATE INDEX IF NOT EXISTS "AiJob_songId_idx" ON "AiJob"("songId");

DO $$ BEGIN
  ALTER TABLE "AiJob" ADD CONSTRAINT "AiJob_bandId_fkey" FOREIGN KEY ("bandId") REFERENCES "Band"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "AiJob" ADD CONSTRAINT "AiJob_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
