-- ============================================================
-- 008 — items.source / items.source_id columns
--
-- The application code (`upsertVerifiedItem` in db.js, the seed-catalog
-- pipeline) deduplicates verified catalog rows by (source, source_id) so the
-- same book can never be inserted twice.  Those columns were referenced from
-- code without ever being added — fix that.
--
-- `source`    — short identifier for the data origin: 'google_books',
--               'open_library', 'curated', 'tmdb', 'igdb' etc.
-- `source_id` — that source's stable identifier for the row.
-- ============================================================

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS source    text,
  ADD COLUMN IF NOT EXISTS source_id text;

-- Backfill from external_ids where we have provenance already (Goodreads-era rows).
UPDATE items SET source = 'goodreads', source_id = external_ids->>'goodreads_id'
 WHERE source IS NULL AND external_ids->>'goodreads_id' IS NOT NULL;

-- Unique constraint so upsert(onConflict: source,source_id) actually works.
-- Partial: only enforce when both are present (skip legacy rows missing them).
CREATE UNIQUE INDEX IF NOT EXISTS items_source_source_id_unique
  ON items (source, source_id)
  WHERE source IS NOT NULL AND source_id IS NOT NULL;

-- Common admin query: "all verified items from this source"
CREATE INDEX IF NOT EXISTS items_source_idx ON items (source) WHERE source IS NOT NULL;
