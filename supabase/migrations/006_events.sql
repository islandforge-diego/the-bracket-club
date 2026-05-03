-- ============================================================
-- 006 — Event tracking
--
-- Single-table event log for behavioral analytics. Every meaningful user
-- action gets a row here so we can answer questions about engagement,
-- funnel drop-off, retention cohorts, and which features are used.
--
-- Standard event types written by the app today:
--   sign_in           — user authenticated (one per session start)
--   book_added        — book added to a slot (props: slot, year, source)
--   winner_crowned    — month/slot winner picked (props: slot, year)
--   bracket_pick      — annual-bracket vote cast (props: match_id, year)
--   season_champion   — season champion crowned (props: year)
--
-- New event types can be added freely — properties is jsonb so each event
-- can carry whatever context matters.
-- ============================================================

CREATE TABLE events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  event_type  text NOT NULL,
  properties  jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Per-user activity feed (powers "what has Alice done lately?")
CREATE INDEX events_user_created ON events(user_id, created_at DESC);

-- Aggregate by event type ("how many sign-ins this week?")
CREATE INDEX events_type_created ON events(event_type, created_at DESC);

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Users can write their own events. user_id must match the caller.
CREATE POLICY "events: user inserts own"
  ON events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Only admins can read the event log.
CREATE POLICY "events: admin reads all"
  ON events FOR SELECT TO authenticated
  USING (is_admin());
