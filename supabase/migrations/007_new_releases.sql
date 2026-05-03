-- ── Migration 007: New Releases catalog support ─────────────────────────────
--
-- 1. Index to speed up New Releases queries (verified items by published_at)
-- 2. Admin policy to insert/update verified items (curated catalog)
-- ---------------------------------------------------------------------------

-- ── 1. Partial index on published_at for verified items ────────────────────
CREATE INDEX IF NOT EXISTS items_published_at_verified_idx
  ON items (published_at DESC)
  WHERE is_verified = true;

-- ── 2. Admin policy: full CRUD on items table ─────────────────────────────
-- Existing user policies only allow inserting/updating their own unverified
-- items. Admins need to be able to insert & update verified catalog entries.
CREATE POLICY "items: admin full access"
  ON items
  FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
