-- Optional demo seed for Bandival schema
-- Run after 001_init_bandival.sql

BEGIN;

WITH u AS (
  INSERT INTO app_user (email, password_hash, display_name)
  VALUES ('owner@bandival.local', 'replace-me', 'Band Owner')
  RETURNING id
), b AS (
  INSERT INTO band (name, slug, created_by)
  SELECT 'Die Testband', 'die-testband', id FROM u
  RETURNING id
), m AS (
  INSERT INTO band_member (band_id, user_id, role, instrument_primary)
  SELECT b.id, u.id, 'owner', 'Vocals'
  FROM b, u
  RETURNING id, band_id, user_id
), s AS (
  INSERT INTO song (band_id, title, tempo_bpm, duration_seconds, idea_by_member_id)
  SELECT m.band_id, 'Erster Song', 128.00, 210, m.id
  FROM m
  RETURNING id, band_id
), l AS (
  INSERT INTO song_lyrics_revision (song_id, revision_number, title, lyrics_markdown, is_current, created_by)
  SELECT s.id, 1, 'V1', 'Das ist ein Platzhalter fuer Lyrics.', TRUE, m.user_id
  FROM s, m
  RETURNING song_id
), a AS (
  INSERT INTO song_audio_version (song_id, version_number, file_url, file_name, duration_seconds, is_current, uploaded_by)
  SELECT s.id, 1, 'https://example.invalid/audio/song-v1.mp3', 'song-v1.mp3', 210, TRUE, m.user_id
  FROM s, m
  RETURNING song_id
), e AS (
  INSERT INTO event (band_id, title, status, starts_at)
  SELECT s.band_id, 'Club Gig', 'planned', NOW() + INTERVAL '14 day'
  FROM s
  RETURNING id, band_id
), sl AS (
  INSERT INTO setlist (band_id, name, event_id)
  SELECT e.band_id, 'Setlist Club Gig', e.id
  FROM e
  RETURNING id
)
INSERT INTO setlist_item (setlist_id, song_id, position)
SELECT sl.id, s.id, 1
FROM sl, s;

COMMIT;
