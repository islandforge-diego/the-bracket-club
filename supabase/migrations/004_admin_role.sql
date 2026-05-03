-- ============================================================
-- 004 — Admin role + admin views
-- Lets specific users (you) inspect signups, marketing opt-ins, and
-- per-user activity from a private /admin page in the app.
-- ============================================================

-- ── 1. Admin flag on profiles ──────────────────────────────────────────────
ALTER TABLE profiles ADD COLUMN is_admin boolean NOT NULL DEFAULT false;

-- ── 2. Helper: is the current user an admin? ───────────────────────────────
-- Used by RLS policies and admin views. SECURITY DEFINER so it can read
-- profiles even if the caller's RLS policy would block it.
CREATE OR REPLACE FUNCTION is_admin() RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ── 3. Admin can read all profiles (for the user list) ─────────────────────
CREATE POLICY "profiles: admin reads all"
  ON profiles FOR SELECT TO authenticated
  USING (is_admin());

-- ── 4. Admin user summary view ─────────────────────────────────────────────
-- Joins profile + auth user + activity counts. SECURITY DEFINER means it
-- can reach into auth.users; the WHERE clause on is_admin() ensures
-- non-admins see zero rows.
CREATE OR REPLACE VIEW admin_user_summary
WITH (security_invoker = false) AS
  SELECT
    p.id,
    u.email,
    p.display_name,
    p.marketing_consent,
    p.consented_at,
    p.is_admin,
    u.created_at         AS signed_up_at,
    u.last_sign_in_at,
    (SELECT COUNT(*)         FROM shelf_items   WHERE user_id = p.id) AS shelf_count,
    (SELECT COUNT(*)         FROM bracket_picks WHERE user_id = p.id) AS pick_count,
    (SELECT COUNT(*)         FROM season_champions WHERE user_id = p.id) AS season_champ_count,
    (SELECT COUNT(DISTINCT season_id) FROM shelf_items WHERE user_id = p.id) AS active_seasons
  FROM profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE is_admin();

GRANT SELECT ON admin_user_summary TO authenticated;

-- ── 5. Aggregate stats view (single-row counts for the dashboard) ──────────
CREATE OR REPLACE VIEW admin_platform_stats
WITH (security_invoker = false) AS
  SELECT
    (SELECT COUNT(*) FROM auth.users) AS total_users,
    (SELECT COUNT(*) FROM profiles WHERE marketing_consent = true) AS marketing_opt_ins,
    (SELECT COUNT(*) FROM auth.users WHERE last_sign_in_at >= now() - interval '30 days') AS active_30d,
    (SELECT COUNT(*) FROM auth.users WHERE created_at >= now() - interval '7 days') AS new_signups_7d,
    (SELECT COUNT(*) FROM shelf_items)   AS total_shelf_items,
    (SELECT COUNT(*) FROM bracket_picks) AS total_bracket_picks,
    (SELECT COUNT(*) FROM season_champions) AS total_season_champions
  WHERE is_admin();

GRANT SELECT ON admin_platform_stats TO authenticated;
