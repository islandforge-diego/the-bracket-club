-- ============================================================
-- 009 — Cloud sync for shelves, custom brackets, and user prefs
--
-- Until now, three pieces of user state lived only in localStorage:
--   - bc_user_shelves     → shelves table
--   - bc_custom_brackets  → custom_brackets table
--   - bc_user_prefs       → user_preferences table
--
-- This migration adds Supabase mirrors so signed-in users get cross-device
-- sync. The local store stays the source of truth at runtime; cloudSync.js
-- pushes changes up (debounced) and pulls down on sign-in, merging by
-- (user_id, client_id) with newer updated_at winning.
--
-- Why client_id? Each row has a stable client-generated id (the same id
-- localStorage already uses, e.g. "shelf_xyz", "cb_abc"). Server uses its
-- own uuid as the primary key, so the (user_id, client_id) UNIQUE constraint
-- gives us idempotent upserts.
-- ============================================================

-- ── SHELVES ────────────────────────────────────────────────────────────────
CREATE TABLE shelves (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  client_id    text NOT NULL,
  name         text NOT NULL,
  icon         text NOT NULL DEFAULT '📚',
  pinned       boolean NOT NULL DEFAULT false,
  -- Books are stored inline as jsonb (matches localStorage shape exactly).
  -- Keeps the sync layer dead simple: one row in == one row out.
  books        jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, client_id)
);

CREATE INDEX shelves_user_updated ON shelves(user_id, updated_at DESC);

-- ── CUSTOM BRACKETS ────────────────────────────────────────────────────────
CREATE TABLE custom_brackets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  client_id    text NOT NULL,
  title        text NOT NULL,
  year         int,
  format       text,
  size         int  NOT NULL DEFAULT 8,
  month        int,                          -- 0..11 or null
  preset_id    text,                         -- community-preset origin (if any)
  pinned       boolean NOT NULL DEFAULT false,
  -- Same rationale as shelves.books — denormalised inside one row.
  items        jsonb NOT NULL DEFAULT '[]'::jsonb,
  picks        jsonb NOT NULL DEFAULT '{}'::jsonb,
  winner       jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, client_id)
);

CREATE INDEX custom_brackets_user_updated ON custom_brackets(user_id, updated_at DESC);

-- ── USER PREFERENCES ───────────────────────────────────────────────────────
-- One row per user. genre prefs, sound toggle, cached Goodreads ID etc.
CREATE TABLE user_preferences (
  user_id            uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  genres             text[] NOT NULL DEFAULT '{}',
  onboarded_at       timestamptz,
  sound_enabled      boolean NOT NULL DEFAULT true,
  goodreads_user_id  text,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- ── RLS — own-rows-only ────────────────────────────────────────────────────
ALTER TABLE shelves          ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_brackets  ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shelves: own rows"
  ON shelves FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "custom_brackets: own rows"
  ON custom_brackets FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_preferences: own row"
  ON user_preferences FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── updated_at triggers ────────────────────────────────────────────────────
-- update_updated_at() function already exists from 001_initial_schema.sql.
CREATE TRIGGER shelves_updated_at          BEFORE UPDATE ON shelves
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER custom_brackets_updated_at  BEFORE UPDATE ON custom_brackets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER user_preferences_updated_at BEFORE UPDATE ON user_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
