-- Adds optional author links for discussion threads/posts.
ALTER TABLE "DiscussionThread"
ADD COLUMN IF NOT EXISTS "createdByUserId" UUID;

ALTER TABLE "DiscussionPost"
ADD COLUMN IF NOT EXISTS "createdByUserId" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DiscussionThread_createdByUserId_fkey'
  ) THEN
    ALTER TABLE "DiscussionThread"
    ADD CONSTRAINT "DiscussionThread_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "AppUser"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DiscussionPost_createdByUserId_fkey'
  ) THEN
    ALTER TABLE "DiscussionPost"
    ADD CONSTRAINT "DiscussionPost_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "AppUser"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "DiscussionThread_createdByUserId_createdAt_idx"
ON "DiscussionThread"("createdByUserId", "createdAt");

CREATE INDEX IF NOT EXISTS "DiscussionPost_createdByUserId_createdAt_idx"
ON "DiscussionPost"("createdByUserId", "createdAt");
