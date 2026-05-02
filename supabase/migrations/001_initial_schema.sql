-- ============================================================
-- The Bracket Club — Initial Schema
-- Run this in the Supabase SQL editor to set up the database.
-- ============================================================

-- ── CATEGORIES ──────────────────────────────────────────────────────────────
-- One row per content type. Adding a new category (movies, games, etc.)
-- is a single INSERT here plus a new page in the frontend.

CREATE TABLE categories (
  id          text PRIMARY KEY,        -- "books", "movies", "games"
  name        text NOT NULL,
  icon        text,
  config      jsonb NOT NULL DEFAULT '{}', -- mirrors categoryConfig.js
  sort_order  int  NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

-- Seed the books category
INSERT INTO categories (id, name, icon, sort_order) VALUES
  ('books', 'Books', '📚', 1);

-- ── SEASONS ─────────────────────────────────────────────────────────────────
-- A season = one complete bracket cycle (e.g. Jan–Dec for books).
-- slot_count and slot_label make this generic: 12 monthly slots for books,
-- 4 quarterly slots for games, etc.

CREATE TABLE seasons (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id  text NOT NULL REFERENCES categories(id),
  year         int  NOT NULL,
  name         text NOT NULL,           -- "2025 Books"
  slot_count   int  NOT NULL DEFAULT 12,
  slot_label   text NOT NULL DEFAULT 'month', -- "month" | "quarter" | "week"
  start_date   date,
  end_date     date,
  is_active    boolean NOT NULL DEFAULT false,
  created_at   timestamptz DEFAULT now(),
  UNIQUE(category_id, year)
);

-- Seed 2025 and 2026 book seasons
INSERT INTO seasons (category_id, year, name, slot_count, slot_label, start_date, end_date, is_active) VALUES
  ('books', 2025, '2025 Books', 12, 'month', '2025-01-01', '2025-12-31', false),
  ('books', 2026, '2026 Books', 12, 'month', '2026-01-01', '2026-12-31', true);

-- ── ITEMS ────────────────────────────────────────────────────────────────────
-- Shared catalog across all users. Enrichment (genres, tags) runs once
-- server-side — no more per-user Open Library calls.

CREATE TABLE items (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id          text NOT NULL REFERENCES categories(id),

  -- Core identity
  title                text NOT NULL,
  creator              text,             -- author / director / artist
  cover_url            text,
  description          text,

  -- Release context (for "look back at 2024 releases" filtering)
  published_year       int,
  published_month      int,

  -- Enriched genre/mood data
  genres               text[]  NOT NULL DEFAULT '{}',
  tags                 text[]  NOT NULL DEFAULT '{}',
  enriched_at          timestamptz,

  -- External source IDs in one place
  -- { goodreads_id, isbn, open_library_id, tmdb_id, imdb_id, spotify_id }
  external_ids         jsonb NOT NULL DEFAULT '{}',

  -- Category-specific fields (page_count, runtime, platform, etc.)
  metadata             jsonb NOT NULL DEFAULT '{}',

  -- Denormalized community stats — updated by triggers, read instantly
  platform_avg_rating   numeric(3,2),
  platform_rating_count int NOT NULL DEFAULT 0,
  platform_pick_count   int NOT NULL DEFAULT 0,

  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);

CREATE INDEX items_category_year  ON items(category_id, published_year);
CREATE INDEX items_genres_gin     ON items USING gin(genres);
CREATE INDEX items_external_ids   ON items USING gin(external_ids);
-- Prevent duplicate items from the same external source
CREATE UNIQUE INDEX items_goodreads_unique ON items((external_ids->>'goodreads_id')) WHERE external_ids->>'goodreads_id' IS NOT NULL;

-- Auto-update updated_at on any change
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER items_updated_at BEFORE UPDATE ON items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── PROFILES ─────────────────────────────────────────────────────────────────
-- Extends Supabase auth.users with display info.
-- Created automatically when a user signs up (see trigger below).

CREATE TABLE profiles (
  id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  text,
  avatar_url    text,
  created_at    timestamptz DEFAULT now()
);

-- Auto-create a profile row when a new user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ── SHELF ITEMS ──────────────────────────────────────────────────────────────
-- Personal reading log. One row per book per bracket slot per user per season.
-- slot = 0–11 for monthly, 0–3 for quarterly, etc.
-- read_at = when they actually finished it (can differ from bracket slot)

CREATE TABLE shelf_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  item_id     uuid NOT NULL REFERENCES items(id),
  season_id   uuid NOT NULL REFERENCES seasons(id),
  slot        int  NOT NULL,
  user_rating smallint CHECK (user_rating BETWEEN 1 AND 5),
  read_at     date,
  notes       text,
  added_at    timestamptz DEFAULT now(),
  UNIQUE(user_id, season_id, slot, item_id)
);

CREATE INDEX shelf_items_user_season ON shelf_items(user_id, season_id);
CREATE INDEX shelf_items_item        ON shelf_items(item_id);

-- ── BRACKET PICKS ────────────────────────────────────────────────────────────
-- Every vote in every matchup, for both slot brackets and the annual bracket.
-- bracket_type: "slot" = within a period's bracket, "annual" = year-end bracket
-- This is the richest data in the system — head-to-head outcomes at scale.

CREATE TABLE bracket_picks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  season_id     uuid NOT NULL REFERENCES seasons(id),
  bracket_type  text NOT NULL CHECK (bracket_type IN ('slot', 'annual')),
  slot          int,           -- null for annual bracket
  match_id      text NOT NULL, -- "r1_0", "r2_1", "final"
  winner_id     uuid NOT NULL REFERENCES items(id),
  picked_at     timestamptz DEFAULT now(),
  UNIQUE(user_id, season_id, bracket_type, slot, match_id)
);

CREATE INDEX bracket_picks_user_season ON bracket_picks(user_id, season_id);
CREATE INDEX bracket_picks_winner      ON bracket_picks(winner_id);

-- ── SLOT CHAMPIONS ───────────────────────────────────────────────────────────
-- Denormalized: the item a user crowned winner for a given slot.
-- Critical for fast community leaderboard queries — one row per user per slot,
-- no aggregation needed to answer "what did most users pick for January?"

CREATE TABLE slot_champions (
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  season_id   uuid NOT NULL REFERENCES seasons(id),
  slot        int  NOT NULL,
  item_id     uuid NOT NULL REFERENCES items(id),
  crowned_at  timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, season_id, slot)
);

CREATE INDEX slot_champions_season_slot ON slot_champions(season_id, slot);
CREATE INDEX slot_champions_item        ON slot_champions(item_id);

-- ── SEASON CHAMPIONS ─────────────────────────────────────────────────────────
-- The item a user crowned as their overall season winner (BOTY, MOTY, etc.)
-- Trigger updates platform_pick_count on items when a champion is set.

CREATE TABLE season_champions (
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  season_id   uuid NOT NULL REFERENCES seasons(id),
  item_id     uuid NOT NULL REFERENCES items(id),
  crowned_at  timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, season_id)
);

CREATE INDEX season_champions_season ON season_champions(season_id);
CREATE INDEX season_champions_item   ON season_champions(item_id);

-- Keep platform_pick_count on items in sync
CREATE OR REPLACE FUNCTION sync_platform_pick_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE items SET platform_pick_count = platform_pick_count + 1 WHERE id = NEW.item_id;
  END IF;
  IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
    UPDATE items SET platform_pick_count = GREATEST(0, platform_pick_count - 1) WHERE id = OLD.item_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER season_champions_pick_count
  AFTER INSERT OR UPDATE OR DELETE ON season_champions
  FOR EACH ROW EXECUTE FUNCTION sync_platform_pick_count();

-- ── TRENDING PREFERENCES ─────────────────────────────────────────────────────
-- One row per user per category. Field names are generic so the same table
-- works for books, movies, games, etc.

CREATE TABLE trending_preferences (
  user_id                 uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category_id             text NOT NULL REFERENCES categories(id),
  personalization_enabled boolean NOT NULL DEFAULT false,
  selected_categories     text[] NOT NULL DEFAULT '{}',
  selected_tags           text[] NOT NULL DEFAULT '{}',
  excluded_tags           text[] NOT NULL DEFAULT '{}',
  discovery_mode          text   NOT NULL DEFAULT 'balanced'
                          CHECK (discovery_mode IN ('mainstream', 'balanced', 'taste_first')),
  updated_at              timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, category_id)
);

-- ── COMMUNITY VIEWS ──────────────────────────────────────────────────────────
-- These replace Goodreads as the trending source once the platform has users.
-- Read-only — all writes go through the tables above.

-- Most-read items per slot across all users (platform trending)
CREATE VIEW community_slot_trending AS
  SELECT
    si.season_id,
    si.slot,
    si.item_id,
    COUNT(DISTINCT si.user_id) AS reader_count
  FROM shelf_items si
  GROUP BY si.season_id, si.slot, si.item_id;

-- Most common slot champion per slot (community bracket result)
CREATE VIEW community_slot_champions AS
  SELECT
    sc.season_id,
    sc.slot,
    sc.item_id,
    COUNT(*) AS pick_count,
    RANK() OVER (PARTITION BY sc.season_id, sc.slot ORDER BY COUNT(*) DESC) AS rank
  FROM slot_champions sc
  GROUP BY sc.season_id, sc.slot, sc.item_id;

-- Most common season champion (community BOTY/MOTY/etc.)
CREATE VIEW community_season_champions AS
  SELECT
    sc.season_id,
    sc.item_id,
    COUNT(*) AS pick_count,
    RANK() OVER (PARTITION BY sc.season_id ORDER BY COUNT(*) DESC) AS rank
  FROM season_champions sc
  GROUP BY sc.season_id, sc.item_id;
