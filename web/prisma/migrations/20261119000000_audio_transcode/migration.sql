-- Server-side audio conversion (idempotent): every upload is converted to MP3 in the background,
-- song recordings and stems keep the original file for download.
ALTER TABLE "SongAudioVersion" ADD COLUMN IF NOT EXISTS "originalFileUrl" TEXT;
ALTER TABLE "SongAudioVersion" ADD COLUMN IF NOT EXISTS "originalMimeType" TEXT;
ALTER TABLE "SongAudioVersion" ADD COLUMN IF NOT EXISTS "transcodeStatus" TEXT;
ALTER TABLE "SongStem" ADD COLUMN IF NOT EXISTS "originalFileUrl" TEXT;
ALTER TABLE "SongStem" ADD COLUMN IF NOT EXISTS "transcodeStatus" TEXT;
ALTER TABLE "Idea" ADD COLUMN IF NOT EXISTS "transcodeStatus" TEXT;
