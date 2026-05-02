-- ============================================================
-- 002 — Multi-source items: creators[], user submissions, dedup, provenance
-- Adds the columns needed to support movies, games, and any future category
-- without losing data when integrating multiple public APIs.
-- ============================================================

-- ── 1. creators[]: replace singular creator with an array ───────────────────
-- Books: co-authors. Movies: director + writers. Games: studio + publisher.

ALTER TABLE items ADD COLUMN creators text[] NOT NULL DEFAULT '{}';

-- Backfill: any existing single-creator rows become a one-element array
UPDATE items SET creators = ARRAY[creator] WHERE creator IS NOT NULL AND creator <> '';

ALTER TABLE items DROP COLUMN creator;

-- ── 2. User-submitted items + canonical/duplicate handling ─────────────────
-- For games especially, indie titles aren't in IGDB. Users can create their
-- own entries; admins can later mark the canonical one and point dupes at it.

ALTER TABLE items
  ADD COLUMN created_by_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN is_verified        boolean NOT NULL DEFAULT false,
  ADD COLUMN canonical_id       uuid REFERENCES items(id) ON DELETE SET NULL;

-- Common queries: "show me this item, or its canonical version"
CREATE INDEX items_canonical_id ON items(canonical_id) WHERE canonical_id IS NOT NULL;
CREATE INDEX items_created_by   ON items(created_by_user_id) WHERE created_by_user_id IS NOT NULL;

-- ── 3. Data source provenance ──────────────────────────────────────────────
-- Replaces the single `enriched_at` with a richer per-source log:
--   {
--     "tmdb":         { "id": 12345, "fetched_at": "2026-05-01T...", "fields": ["genres","cover_url"] },
--     "open_library": { "fetched_at": "2026-04-20T...", "fields": ["genres"] }
--   }
-- This lets us know what to refresh, who said what, and resolve conflicts.

ALTER TABLE items ADD COLUMN data_sources jsonb NOT NULL DEFAULT '{}';

-- Backfill: convert legacy enriched_at into a generic source entry
UPDATE items
   SET data_sources = jsonb_build_object('legacy', jsonb_build_object('fetched_at', enriched_at))
 WHERE enriched_at IS NOT NULL;

-- Keep enriched_at for now as a quick "any source touched this" timestamp.
-- It can be dropped in a future migration once code paths stop using it.

-- ── 4. Add a precise published_at for cases where year/month aren't enough ──
-- Movies have specific release dates; games have launch dates. Books often
-- only have a year. Storing all three lets each category use what it has.

ALTER TABLE items ADD COLUMN published_at date;

-- Backfill from existing year+month where possible
UPDATE items
   SET published_at = make_date(published_year, COALESCE(published_month, 1), 1)
 WHERE published_year IS NOT NULL;

-- ── 5. Allow user-submitted items to be inserted under RLS ─────────────────
-- Existing items policy is read-only. Add a write policy so authenticated
-- users can create their own items (always with created_by_user_id = self,
-- never verified — that's an admin action).

CREATE POLICY "items: user can insert own" ON items
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = created_by_user_id
    AND is_verified = false
    AND canonical_id IS NULL
  );

CREATE POLICY "items: user can update own unverified" ON items
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = created_by_user_id
    AND is_verified = false
  );
