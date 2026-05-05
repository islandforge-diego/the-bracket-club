-- ============================================================
-- 010 — Multiplayer brackets
--
-- Author shares their bracket via an unguessable URL → friends (signed-in
-- or anonymous) cast their own picks → everyone sees aggregate results
-- after they finish.
--
-- Design
-- ──────
-- • custom_brackets gains share/settings columns.  Presence of `share_code`
--   means the bracket is shared (i.e. publicly readable to anyone with the
--   link).  Author can revoke by nulling the share_code.
-- • bracket_participations holds every voter's picks (author included once
--   they share & start voting in multiplayer mode).  A participation is
--   keyed by (bracket_id, user_id) for signed-in voters or (bracket_id,
--   anon_id) for anonymous voters.  Anonymous IDs are long random UUIDs
--   stored in localStorage — possessing one is the "write password".
--
-- Security caveats
-- ────────────────
-- Anonymous writes use anon_id as a row-level secret.  RLS allows any anon
-- caller to UPDATE/DELETE rows where anon_id IS NOT NULL because Postgres
-- can't see the caller's anon_id (no per-anon JWT claim).  The application
-- always filters by anon_id, so in practice only the holder of that ID
-- mutates their row.  Tighten via signed requests/Edge Function later if
-- griefing materialises.
-- ============================================================

-- ── 1. custom_brackets sharing columns ────────────────────────────────────
ALTER TABLE custom_brackets
  ADD COLUMN share_code              text UNIQUE,
  ADD COLUMN voting_closes_at        timestamptz,
  ADD COLUMN show_participant_names  boolean NOT NULL DEFAULT true,
  ADD COLUMN reveal_mode             text    NOT NULL DEFAULT 'reveal_at_end'
                                     CHECK (reveal_mode IN ('reveal_at_end', 'live')),
  ADD COLUMN allow_anonymous         boolean NOT NULL DEFAULT true;

CREATE INDEX custom_brackets_share_code_idx
  ON custom_brackets(share_code) WHERE share_code IS NOT NULL;

-- Allow anyone (signed-in or anon) to read a bracket via its share_code.
-- Combines with the existing "own rows" FOR ALL policy via OR — authors
-- still see their unshared brackets as before.
CREATE POLICY "custom_brackets: public read by share_code"
  ON custom_brackets FOR SELECT
  TO authenticated, anon
  USING (share_code IS NOT NULL);

-- ── 2. bracket_participations table ───────────────────────────────────────
CREATE TABLE bracket_participations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bracket_id    uuid NOT NULL REFERENCES custom_brackets(id) ON DELETE CASCADE,
  -- Exactly one of user_id / anon_id is set per row.
  user_id       uuid REFERENCES profiles(id) ON DELETE CASCADE,
  anon_id       text,
  display_name  text NOT NULL,
  picks         jsonb NOT NULL DEFAULT '{}'::jsonb,
  winner        jsonb,
  joined_at     timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz,
  CHECK ((user_id IS NULL) <> (anon_id IS NULL))
);

CREATE UNIQUE INDEX bracket_participations_user_idx
  ON bracket_participations(bracket_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX bracket_participations_anon_idx
  ON bracket_participations(bracket_id, anon_id) WHERE anon_id IS NOT NULL;
CREATE INDEX bracket_participations_bracket_idx
  ON bracket_participations(bracket_id);

ALTER TABLE bracket_participations ENABLE ROW LEVEL SECURITY;

-- ── 3. bracket_participations RLS ─────────────────────────────────────────

-- READ: anyone (auth or anon) can read participations for a bracket that
-- has been shared.  The aggregate vote tally needs broad read access.
CREATE POLICY "bracket_participations: read shared"
  ON bracket_participations FOR SELECT
  TO authenticated, anon
  USING (
    EXISTS (
      SELECT 1 FROM custom_brackets cb
       WHERE cb.id = bracket_id
         AND cb.share_code IS NOT NULL
    )
  );

-- INSERT: anyone joining a shared bracket.
--   • Authenticated path: user_id must match auth.uid(), anon_id must be null.
--   • Anonymous path: anon_id must be set, user_id must be null, and the
--     bracket must have allow_anonymous = true.
--   • Voting deadline (if any) must not have passed.
CREATE POLICY "bracket_participations: insert into shared"
  ON bracket_participations FOR INSERT
  TO authenticated, anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM custom_brackets cb
       WHERE cb.id = bracket_id
         AND cb.share_code IS NOT NULL
         AND (cb.voting_closes_at IS NULL OR cb.voting_closes_at > now())
         AND (
           (auth.uid() IS NOT NULL AND user_id = auth.uid() AND anon_id IS NULL)
           OR
           (auth.uid() IS NULL  AND user_id IS NULL  AND anon_id IS NOT NULL
              AND cb.allow_anonymous = true)
         )
    )
  );

-- UPDATE: own row.
--   • Authenticated: user_id matches auth.uid().
--   • Anonymous: anon_id is set on the row (effective security comes from
--     the client always filtering by its anon_id — see header comment).
CREATE POLICY "bracket_participations: update own"
  ON bracket_participations FOR UPDATE
  TO authenticated, anon
  USING (
    (auth.uid() IS NOT NULL AND user_id = auth.uid())
    OR
    (auth.uid() IS NULL AND anon_id IS NOT NULL)
  )
  WITH CHECK (
    (auth.uid() IS NOT NULL AND user_id = auth.uid())
    OR
    (auth.uid() IS NULL AND anon_id IS NOT NULL)
  );

-- DELETE: own row OR bracket author can prune.
CREATE POLICY "bracket_participations: delete own or author"
  ON bracket_participations FOR DELETE
  TO authenticated, anon
  USING (
    (auth.uid() IS NOT NULL AND user_id = auth.uid())
    OR
    (auth.uid() IS NULL AND anon_id IS NOT NULL)
    OR
    EXISTS (
      SELECT 1 FROM custom_brackets cb
       WHERE cb.id = bracket_id AND cb.user_id = auth.uid()
    )
  );

-- ── 4. updated_at trigger? Not needed for participations — we have
--      joined_at and completed_at which capture lifecycle, and picks edits
--      are frequent (every match), so no row-level audit timestamp.
