-- Bandival Postgres schema
-- Target: PostgreSQL 14+
-- Features covered:
-- - Authentication profile + band memberships + invites
-- - Songs with notation, audio versions, lyrics revisions, metadata
-- - Lightweight forum discussions for songs/events/band
-- - Setlists with copy support, assets, and PDF export metadata
-- - Calendar/events/venues + member availability + status planning
-- - Finance (band cashbook, recurring expenses)
-- - Offline sync foundation with per-table change feed

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'membership_role') THEN
    CREATE TYPE membership_role AS ENUM ('owner', 'admin', 'member');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invite_status') THEN
    CREATE TYPE invite_status AS ENUM ('pending', 'accepted', 'revoked', 'expired');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'song_visibility') THEN
    CREATE TYPE song_visibility AS ENUM ('band', 'private_draft');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'attachment_kind') THEN
    CREATE TYPE attachment_kind AS ENUM ('lead_sheet', 'score_pdf', 'score_musicxml', 'score_image', 'lyrics_doc', 'other');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'thread_target_type') THEN
    CREATE TYPE thread_target_type AS ENUM ('band', 'song', 'event');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_status') THEN
    CREATE TYPE event_status AS ENUM ('draft', 'planned', 'offered', 'confirmed', 'cancelled', 'completed');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'availability_state') THEN
    CREATE TYPE availability_state AS ENUM ('yes', 'maybe', 'no');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transaction_type') THEN
    CREATE TYPE transaction_type AS ENUM ('income', 'expense', 'transfer');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'recurrence_interval') THEN
    CREATE TYPE recurrence_interval AS ENUM ('monthly', 'quarterly', 'yearly');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'change_operation') THEN
    CREATE TYPE change_operation AS ENUM ('insert', 'update', 'delete');
  END IF;
END$$;

-- -----------------------------------------------------------------------------
-- Utility trigger functions
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_row_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.row_version = OLD.row_version + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- Core identity + band model
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app_user (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email CITEXT NOT NULL UNIQUE,
  password_hash TEXT,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  locale TEXT NOT NULL DEFAULT 'de-DE',
  timezone TEXT NOT NULL DEFAULT 'Europe/Berlin',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  row_version BIGINT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS auth_identity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_user_id)
);

CREATE TABLE IF NOT EXISTS band (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug CITEXT NOT NULL UNIQUE,
  description TEXT,
  base_currency CHAR(3) NOT NULL DEFAULT 'EUR',
  default_rehearsal_location TEXT,
  created_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  row_version BIGINT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS band_member (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  band_id UUID NOT NULL REFERENCES band(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  role membership_role NOT NULL DEFAULT 'member',
  instrument_primary TEXT,
  instrument_secondary TEXT[],
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  row_version BIGINT NOT NULL DEFAULT 1,
  UNIQUE (band_id, user_id)
);

CREATE TABLE IF NOT EXISTS band_invite (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  band_id UUID NOT NULL REFERENCES band(id) ON DELETE CASCADE,
  email CITEXT NOT NULL,
  invited_by UUID NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
  token TEXT NOT NULL UNIQUE,
  status invite_status NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  row_version BIGINT NOT NULL DEFAULT 1
);

-- -----------------------------------------------------------------------------
-- Song model
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS song (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  band_id UUID NOT NULL REFERENCES band(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  subtitle TEXT,
  key_signature TEXT,
  tempo_bpm NUMERIC(6,2),
  duration_seconds INTEGER,
  spotify_url TEXT,
  spotify_track_id TEXT,
  visibility song_visibility NOT NULL DEFAULT 'band',
  idea_by_member_id UUID REFERENCES band_member(id) ON DELETE SET NULL,
  notes TEXT,
  created_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  row_version BIGINT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS song_tag (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  band_id UUID NOT NULL REFERENCES band(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color_hex CHAR(7),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (band_id, name)
);

CREATE TABLE IF NOT EXISTS song_tag_map (
  song_id UUID NOT NULL REFERENCES song(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES song_tag(id) ON DELETE CASCADE,
  PRIMARY KEY (song_id, tag_id)
);

CREATE TABLE IF NOT EXISTS song_lyrics_revision (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id UUID NOT NULL REFERENCES song(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL,
  title TEXT,
  lyrics_markdown TEXT NOT NULL,
  language_code TEXT DEFAULT 'de',
  created_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (song_id, revision_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_song_lyrics_current
  ON song_lyrics_revision(song_id)
  WHERE is_current = TRUE;

CREATE TABLE IF NOT EXISTS song_audio_version (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id UUID NOT NULL REFERENCES song(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'audio/mpeg',
  file_size_bytes BIGINT,
  duration_seconds INTEGER,
  waveform_json JSONB,
  uploaded_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (song_id, version_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_song_audio_current
  ON song_audio_version(song_id)
  WHERE is_current = TRUE;

CREATE TABLE IF NOT EXISTS song_attachment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id UUID NOT NULL REFERENCES song(id) ON DELETE CASCADE,
  kind attachment_kind NOT NULL,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  file_size_bytes BIGINT,
  editor_payload JSONB,
  uploaded_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS song_bpm_tap_sample (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id UUID NOT NULL REFERENCES song(id) ON DELETE CASCADE,
  tapped_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  tap_count INTEGER NOT NULL CHECK (tap_count >= 2),
  measured_bpm NUMERIC(6,2) NOT NULL,
  measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- Discussions (lightweight forum for songs/events/band)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS discussion_thread (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  band_id UUID NOT NULL REFERENCES band(id) ON DELETE CASCADE,
  target_type thread_target_type NOT NULL,
  target_id UUID,
  title TEXT NOT NULL,
  created_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  row_version BIGINT NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_discussion_target
  ON discussion_thread(target_type, target_id);

CREATE TABLE IF NOT EXISTS discussion_post (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES discussion_thread(id) ON DELETE CASCADE,
  author_id UUID REFERENCES app_user(id) ON DELETE SET NULL,
  body_markdown TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  row_version BIGINT NOT NULL DEFAULT 1
);

-- -----------------------------------------------------------------------------
-- Setlists
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS setlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  band_id UUID NOT NULL REFERENCES band(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  event_id UUID,
  copied_from_setlist_id UUID REFERENCES setlist(id) ON DELETE SET NULL,
  estimated_total_seconds INTEGER,
  cover_image_url TEXT,
  pdf_export_url TEXT,
  created_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  row_version BIGINT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS setlist_item (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setlist_id UUID NOT NULL REFERENCES setlist(id) ON DELETE CASCADE,
  song_id UUID NOT NULL REFERENCES song(id) ON DELETE RESTRICT,
  position INTEGER NOT NULL,
  transition_notes TEXT,
  custom_key_signature TEXT,
  custom_tempo_bpm NUMERIC(6,2),
  custom_duration_seconds INTEGER,
  UNIQUE (setlist_id, position)
);

CREATE TABLE IF NOT EXISTS setlist_asset (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setlist_id UUID NOT NULL REFERENCES setlist(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  label TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
  icon_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- Calendar/events/venues + availability
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS venue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  band_id UUID NOT NULL REFERENCES band(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  street TEXT,
  postal_code TEXT,
  city TEXT,
  country TEXT DEFAULT 'DE',
  website_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  row_version BIGINT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS venue_contact (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venue(id) ON DELETE CASCADE,
  contact_name TEXT,
  role_label TEXT,
  email CITEXT,
  phone TEXT,
  preferred_channel TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS event (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  band_id UUID NOT NULL REFERENCES band(id) ON DELETE CASCADE,
  venue_id UUID REFERENCES venue(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status event_status NOT NULL DEFAULT 'draft',
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  load_in_at TIMESTAMPTZ,
  soundcheck_at TIMESTAMPTZ,
  payout_amount NUMERIC(12,2),
  currency CHAR(3),
  contact_notes TEXT,
  created_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  row_version BIGINT NOT NULL DEFAULT 1,
  CHECK (ends_at IS NULL OR ends_at >= starts_at)
);

ALTER TABLE setlist
  ADD CONSTRAINT fk_setlist_event
  FOREIGN KEY (event_id)
  REFERENCES event(id)
  ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS event_member_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES event(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES band_member(id) ON DELETE CASCADE,
  state availability_state NOT NULL,
  response_note TEXT,
  responded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, member_id)
);

CREATE TABLE IF NOT EXISTS event_message (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES event(id) ON DELETE CASCADE,
  author_id UUID REFERENCES app_user(id) ON DELETE SET NULL,
  recipient_type TEXT NOT NULL,
  recipient_contact TEXT,
  subject TEXT,
  message_body TEXT NOT NULL,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- Finance / band cashbook
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS finance_account (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  band_id UUID NOT NULL REFERENCES band(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type_label TEXT NOT NULL DEFAULT 'cashbox',
  opening_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'EUR',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  row_version BIGINT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS finance_transaction (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  band_id UUID NOT NULL REFERENCES band(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES finance_account(id) ON DELETE CASCADE,
  event_id UUID REFERENCES event(id) ON DELETE SET NULL,
  transaction_kind transaction_type NOT NULL,
  category TEXT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'EUR',
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT,
  created_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  row_version BIGINT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS recurring_expense (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  band_id UUID NOT NULL REFERENCES band(id) ON DELETE CASCADE,
  account_id UUID REFERENCES finance_account(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  category TEXT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'EUR',
  interval recurrence_interval NOT NULL DEFAULT 'monthly',
  day_of_period SMALLINT NOT NULL CHECK (day_of_period BETWEEN 1 AND 31),
  starts_on DATE NOT NULL,
  ends_on DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  row_version BIGINT NOT NULL DEFAULT 1
);

-- -----------------------------------------------------------------------------
-- Offline/sync support
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS client_device (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  device_label TEXT NOT NULL,
  platform TEXT,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sync_change_log (
  id BIGSERIAL PRIMARY KEY,
  band_id UUID,
  table_name TEXT NOT NULL,
  record_id UUID,
  operation change_operation NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  row_version BIGINT,
  payload JSONB
);

CREATE INDEX IF NOT EXISTS idx_sync_change_log_band_time
  ON sync_change_log(band_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_sync_change_log_table_record
  ON sync_change_log(table_name, record_id, changed_at DESC);

CREATE TABLE IF NOT EXISTS user_sync_cursor (
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES client_device(id) ON DELETE CASCADE,
  last_change_id BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, device_id)
);

CREATE OR REPLACE FUNCTION log_sync_change()
RETURNS TRIGGER AS $$
DECLARE
  v_record_id UUID;
  v_band_id UUID;
  v_operation change_operation;
  v_row_version BIGINT;
  v_payload JSONB;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_record_id := OLD.id;
    v_row_version := OLD.row_version;
    v_operation := 'delete';
    v_payload := to_jsonb(OLD);
  ELSE
    v_record_id := NEW.id;
    v_row_version := NEW.row_version;
    v_operation := CASE WHEN TG_OP = 'INSERT' THEN 'insert' ELSE 'update' END;
    v_payload := to_jsonb(NEW);
  END IF;

  -- Most core tables include band_id. For global tables, band_id remains NULL.
  IF TG_OP = 'DELETE' THEN
    IF (to_jsonb(OLD) ? 'band_id') THEN
      v_band_id := (to_jsonb(OLD)->>'band_id')::uuid;
    END IF;
  ELSE
    IF (to_jsonb(NEW) ? 'band_id') THEN
      v_band_id := (to_jsonb(NEW)->>'band_id')::uuid;
    END IF;
  END IF;

  INSERT INTO sync_change_log (band_id, table_name, record_id, operation, row_version, payload)
  VALUES (v_band_id, TG_TABLE_NAME, v_record_id, v_operation, v_row_version, v_payload);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- Song audio current-version behavior
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION song_audio_ensure_single_current()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_current = TRUE THEN
    UPDATE song_audio_version
      SET is_current = FALSE
    WHERE song_id = NEW.song_id
      AND id <> NEW.id
      AND is_current = TRUE;
  ELSIF NOT EXISTS (
    SELECT 1 FROM song_audio_version
    WHERE song_id = NEW.song_id
      AND id <> NEW.id
      AND is_current = TRUE
  ) THEN
    -- If no current version exists, force the first/only row to current.
    NEW.is_current = TRUE;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_song_audio_single_current
BEFORE INSERT OR UPDATE ON song_audio_version
FOR EACH ROW
EXECUTE FUNCTION song_audio_ensure_single_current();

-- -----------------------------------------------------------------------------
-- Generic timestamps, row-version, sync triggers
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION attach_common_triggers(target_table REGCLASS)
RETURNS VOID AS $$
DECLARE
  trigger_prefix TEXT;
BEGIN
  trigger_prefix := regexp_replace(target_table::TEXT, '[^a-zA-Z0-9_]', '_', 'g');

  EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON %s', trigger_prefix, target_table::TEXT);
  EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_row_version ON %s', trigger_prefix, target_table::TEXT);
  EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_sync_change ON %s', trigger_prefix, target_table::TEXT);

  EXECUTE format('CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION set_updated_at()', trigger_prefix, target_table::TEXT);
  EXECUTE format('CREATE TRIGGER trg_%s_row_version BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION set_row_version()', trigger_prefix, target_table::TEXT);
  EXECUTE format('CREATE TRIGGER trg_%s_sync_change AFTER INSERT OR UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION log_sync_change()', trigger_prefix, target_table::TEXT);
END;
$$ LANGUAGE plpgsql;

SELECT attach_common_triggers('app_user'::regclass);
SELECT attach_common_triggers('band'::regclass);
SELECT attach_common_triggers('band_member'::regclass);
SELECT attach_common_triggers('band_invite'::regclass);
SELECT attach_common_triggers('song'::regclass);
SELECT attach_common_triggers('discussion_thread'::regclass);
SELECT attach_common_triggers('discussion_post'::regclass);
SELECT attach_common_triggers('setlist'::regclass);
SELECT attach_common_triggers('venue'::regclass);
SELECT attach_common_triggers('event'::regclass);
SELECT attach_common_triggers('finance_account'::regclass);
SELECT attach_common_triggers('finance_transaction'::regclass);
SELECT attach_common_triggers('recurring_expense'::regclass);

DROP FUNCTION attach_common_triggers(REGCLASS);

-- -----------------------------------------------------------------------------
-- Helpful views
-- -----------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_setlist_runtime AS
SELECT
  s.id AS setlist_id,
  s.band_id,
  COALESCE(SUM(COALESCE(i.custom_duration_seconds, so.duration_seconds, 0)), 0) AS total_seconds,
  COUNT(i.id) AS song_count
FROM setlist s
LEFT JOIN setlist_item i ON i.setlist_id = s.id
LEFT JOIN song so ON so.id = i.song_id
GROUP BY s.id, s.band_id;

CREATE OR REPLACE VIEW v_event_availability_summary AS
SELECT
  e.id AS event_id,
  e.band_id,
  COUNT(a.id) FILTER (WHERE a.state = 'yes') AS yes_count,
  COUNT(a.id) FILTER (WHERE a.state = 'maybe') AS maybe_count,
  COUNT(a.id) FILTER (WHERE a.state = 'no') AS no_count,
  COUNT(bm.id) FILTER (WHERE bm.is_active = TRUE) AS active_member_count
FROM event e
LEFT JOIN band_member bm ON bm.band_id = e.band_id
LEFT JOIN event_member_availability a ON a.event_id = e.id AND a.member_id = bm.id
GROUP BY e.id, e.band_id;

CREATE OR REPLACE VIEW v_finance_balance AS
SELECT
  fa.id AS account_id,
  fa.band_id,
  fa.name,
  fa.currency,
  fa.opening_balance
    + COALESCE(SUM(
      CASE
        WHEN ft.transaction_kind = 'income' THEN ft.amount
        WHEN ft.transaction_kind = 'expense' THEN -ft.amount
        ELSE 0
      END
    ), 0) AS current_balance
FROM finance_account fa
LEFT JOIN finance_transaction ft ON ft.account_id = fa.id
GROUP BY fa.id, fa.band_id, fa.name, fa.currency, fa.opening_balance;

-- -----------------------------------------------------------------------------
-- Indexes for frequent lookups
-- -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_band_member_band_active ON band_member(band_id, is_active);
CREATE INDEX IF NOT EXISTS idx_song_band ON song(band_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_song_audio_song_uploaded ON song_audio_version(song_id, uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_setlist_band ON setlist(band_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_setlist_item_setlist ON setlist_item(setlist_id, position);
CREATE INDEX IF NOT EXISTS idx_event_band_time ON event(band_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS idx_availability_event ON event_member_availability(event_id, state);
CREATE INDEX IF NOT EXISTS idx_fin_tx_band_date ON finance_transaction(band_id, transaction_date DESC);

COMMIT;
