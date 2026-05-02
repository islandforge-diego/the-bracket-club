-- ============================================================
-- 003 — Marketing consent on profiles
-- For sending early-user updates about features and new categories.
-- Always opt-in, captured at sign-up via a checkbox.
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN marketing_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN consented_at      timestamptz;

-- Helper view for exporting the opt-in list (admin / service role only)
CREATE OR REPLACE VIEW marketing_email_list AS
  SELECT
    u.email,
    p.display_name,
    p.consented_at,
    u.created_at AS signed_up_at
  FROM profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.marketing_consent = true;
