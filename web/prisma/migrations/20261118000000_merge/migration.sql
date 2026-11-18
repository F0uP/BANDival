-- Document revisions and merge conflicts (idempotent)
CREATE TABLE IF NOT EXISTS "DocRevision" (
    "id" UUID NOT NULL,
    "bandId" UUID NOT NULL,
    "docType" TEXT NOT NULL,
    "docId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "authorId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DocRevision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DocRevision_docType_docId_revision_key" ON "DocRevision"("docType", "docId", "revision");
CREATE INDEX IF NOT EXISTS "DocRevision_bandId_createdAt_idx" ON "DocRevision"("bandId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "DocRevision" ADD CONSTRAINT "DocRevision_bandId_fkey" FOREIGN KEY ("bandId") REFERENCES "Band"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "MergeConflict" (
    "id" UUID NOT NULL,
    "bandId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "docType" TEXT NOT NULL,
    "docId" UUID NOT NULL,
    "docTitle" TEXT NOT NULL,
    "docUrl" TEXT NOT NULL,
    "baseRevision" INTEGER NOT NULL,
    "theirsRevision" INTEGER NOT NULL,
    "base" JSONB,
    "ours" JSONB NOT NULL,
    "theirs" JSONB NOT NULL,
    "theirsName" TEXT NOT NULL,
    "labels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ(6),
    CONSTRAINT "MergeConflict_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MergeConflict_userId_status_idx" ON "MergeConflict"("userId", "status");
CREATE INDEX IF NOT EXISTS "MergeConflict_docType_docId_idx" ON "MergeConflict"("docType", "docId");

DO $$ BEGIN
  ALTER TABLE "MergeConflict" ADD CONSTRAINT "MergeConflict_bandId_fkey" FOREIGN KEY ("bandId") REFERENCES "Band"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "MergeConflict" ADD CONSTRAINT "MergeConflict_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
