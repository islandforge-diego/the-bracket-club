-- ============================================================
-- 005 — Mock data for development
--
-- Generates 8 fake users with realistic shelf activity so the admin
-- dashboard and trending views have something to render before real
-- users arrive.
--
-- Tagging convention (everything mock is identifiable):
--   • auth.users.email LIKE '%@mock.bracketclub.test'
--   • items.metadata->>'mock' = 'true'
--
-- To wipe all mock data later, an admin runs:
--   SELECT cleanup_mock_data();
-- ============================================================

-- ── 1. Cleanup helper (admin-only, idempotent) ─────────────────────────────
CREATE OR REPLACE FUNCTION cleanup_mock_data() RETURNS text AS $$
DECLARE
  user_count int;
  item_count int;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'cleanup_mock_data: admin access required';
  END IF;

  SELECT COUNT(*) INTO user_count FROM auth.users WHERE email LIKE '%@mock.bracketclub.test';
  SELECT COUNT(*) INTO item_count FROM items WHERE metadata->>'mock' = 'true';

  -- Cascade deletes through profiles → shelf_items / champions / picks
  DELETE FROM auth.users WHERE email LIKE '%@mock.bracketclub.test';
  -- Items have no FK back to users, so a separate delete is fine
  DELETE FROM items WHERE metadata->>'mock' = 'true';

  RETURN format('cleanup_mock_data: removed %s users and %s items', user_count, item_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION cleanup_mock_data() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cleanup_mock_data() TO authenticated;

-- ── 2. Wipe any prior run so this script is re-runnable ─────────────────────
DELETE FROM auth.users WHERE email LIKE '%@mock.bracketclub.test';
DELETE FROM items      WHERE metadata->>'mock' = 'true';

-- ── 3. Insert mock items (popular real-ish titles) ─────────────────────────
INSERT INTO items (category_id, title, creators, cover_url, description, genres, tags, published_year, metadata)
VALUES
  ('books', 'Iron Flame',                              ARRAY['Rebecca Yarros'],         '', 'A dragon-rider sequel where lovers turn enemies turn lovers.',                ARRAY['fantasy','romance'],          ARRAY['page_turners'],               2023, '{"mock":true}'),
  ('books', 'Tomorrow, and Tomorrow, and Tomorrow',    ARRAY['Gabrielle Zevin'],        '', 'Two friends building video games across decades.',                            ARRAY['literary_fiction'],           ARRAY['emotional','book_club'],      2022, '{"mock":true}'),
  ('books', 'The Heaven & Earth Grocery Store',        ARRAY['James McBride'],          '', 'A mystery unearthed in a 1920s Pennsylvania town.',                           ARRAY['historical_fiction'],         ARRAY['award_winning','book_club'],  2023, '{"mock":true}'),
  ('books', 'Fourth Wing',                             ARRAY['Rebecca Yarros'],         '', 'War-college dragons, enemies-to-lovers tropes, viral romantasy hit.',          ARRAY['fantasy','romance'],          ARRAY['page_turners'],               2023, '{"mock":true}'),
  ('books', 'Demon Copperhead',                        ARRAY['Barbara Kingsolver'],     '', 'A modern Appalachian retelling of David Copperfield.',                        ARRAY['literary_fiction'],           ARRAY['award_winning','emotional'],  2022, '{"mock":true}'),
  ('books', 'James',                                   ARRAY['Percival Everett'],       '', 'Huckleberry Finn told from Jim''s perspective.',                              ARRAY['literary_fiction'],           ARRAY['award_winning','book_club'],  2024, '{"mock":true}'),
  ('books', 'Funny Story',                             ARRAY['Emily Henry'],            '', 'Two strangers fake-date after their partners run off together.',              ARRAY['romance'],                    ARRAY['fun_easy','cozy'],            2024, '{"mock":true}'),
  ('books', 'The Women',                               ARRAY['Kristin Hannah'],         '', 'A young nurse goes to Vietnam.',                                              ARRAY['historical_fiction'],         ARRAY['emotional'],                  2024, '{"mock":true}'),
  ('books', 'Yellowface',                              ARRAY['R.F. Kuang'],             '', 'A satire of publishing, race, and authorship.',                               ARRAY['literary_fiction'],           ARRAY['thought_provoking'],          2023, '{"mock":true}'),
  ('books', 'Atomic Habits',                           ARRAY['James Clear'],            '', 'How small habits compound into big change.',                                  ARRAY['self_improvement','business'],ARRAY[]::text[],                     2018, '{"mock":true}'),
  ('books', 'Lessons in Chemistry',                    ARRAY['Bonnie Garmus'],          '', 'A 1960s chemist becomes a TV cooking-show host.',                             ARRAY['literary_fiction','historical_fiction'], ARRAY['fun_easy','book_club'], 2022, '{"mock":true}'),
  ('books', 'The Wager',                               ARRAY['David Grann'],            '', 'An 18th-century shipwreck, mutiny, and survival saga.',                       ARRAY['nonfiction'],                 ARRAY['page_turners'],               2023, '{"mock":true}'),
  ('books', 'Project Hail Mary',                       ARRAY['Andy Weir'],              '', 'A lone astronaut wakes up on a mission to save Earth.',                       ARRAY['sci_fi'],                     ARRAY['page_turners','fun_easy'],    2021, '{"mock":true}'),
  ('books', 'The Seven Husbands of Evelyn Hugo',       ARRAY['Taylor Jenkins Reid'],    '', 'A reclusive starlet finally tells her life story.',                           ARRAY['literary_fiction','romance'], ARRAY['emotional','page_turners'],   2017, '{"mock":true}'),
  ('books', 'Becoming',                                ARRAY['Michelle Obama'],         '', 'Memoir of the former First Lady.',                                            ARRAY['memoir_biography'],           ARRAY['award_winning'],              2018, '{"mock":true}');

-- ── 4. Insert mock auth users (trigger creates profile rows) ───────────────
-- All share the same temp password 'mock_pass_2026' — they're not for real login.
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, last_sign_in_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
SELECT
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated', 'authenticated',
  email,
  crypt('mock_pass_2026', gen_salt('bf')),
  created,
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('display_name', display_name),
  created, last_seen, last_seen,
  '', '', '', ''
FROM (VALUES
  -- (email, display_name, signup_days_ago, last_seen_days_ago)
  ('alice.thompson@mock.bracketclub.test',  'Alice T.', 90,  1),
  ('ben.miller@mock.bracketclub.test',       'Ben M.',  85,  2),
  ('carmen.reyes@mock.bracketclub.test',     'Carmen R.', 60, 5),
  ('david.park@mock.bracketclub.test',       'David P.', 45,  10),
  ('emma.lawson@mock.bracketclub.test',      'Emma L.',  30,  18),
  ('felix.tanner@mock.bracketclub.test',     'Felix T.', 20,  20),
  ('gina.cho@mock.bracketclub.test',         'Gina C.',  10,  3),
  ('henry.liu@mock.bracketclub.test',        'Henry L.',  3,  3)
) AS t(email, display_name, signup_days, last_seen_days)
CROSS JOIN LATERAL (SELECT now() - (signup_days || ' days')::interval AS created,
                           now() - (last_seen_days || ' days')::interval AS last_seen) AS dates;

-- ── 5. Set marketing_consent on a subset of mock users ─────────────────────
UPDATE profiles
   SET marketing_consent = true,
       consented_at = now() - interval '30 days'
 WHERE id IN (
   SELECT id FROM auth.users
    WHERE email IN (
      'alice.thompson@mock.bracketclub.test',
      'carmen.reyes@mock.bracketclub.test',
      'emma.lawson@mock.bracketclub.test',
      'gina.cho@mock.bracketclub.test',
      'henry.liu@mock.bracketclub.test'
    )
 );

-- ── 6. Populate shelf_items per user with varied activity ──────────────────
DO $mock$
DECLARE
  season_id_2026 uuid;
  alice_id   uuid; ben_id     uuid; carmen_id uuid; david_id  uuid;
  emma_id    uuid; felix_id   uuid; gina_id   uuid; henry_id  uuid;
  iron_flame_id uuid; tomorrow_id uuid; heaven_id uuid; fourth_wing_id uuid;
  demon_id uuid; james_id uuid; funny_id uuid; women_id uuid;
  yellowface_id uuid; atomic_id uuid; lessons_id uuid; wager_id uuid;
  hail_mary_id uuid; evelyn_id uuid; becoming_id uuid;
BEGIN
  SELECT id INTO season_id_2026 FROM seasons WHERE category_id='books' AND year=2026;

  SELECT id INTO alice_id  FROM auth.users WHERE email = 'alice.thompson@mock.bracketclub.test';
  SELECT id INTO ben_id    FROM auth.users WHERE email = 'ben.miller@mock.bracketclub.test';
  SELECT id INTO carmen_id FROM auth.users WHERE email = 'carmen.reyes@mock.bracketclub.test';
  SELECT id INTO david_id  FROM auth.users WHERE email = 'david.park@mock.bracketclub.test';
  SELECT id INTO emma_id   FROM auth.users WHERE email = 'emma.lawson@mock.bracketclub.test';
  SELECT id INTO felix_id  FROM auth.users WHERE email = 'felix.tanner@mock.bracketclub.test';
  SELECT id INTO gina_id   FROM auth.users WHERE email = 'gina.cho@mock.bracketclub.test';
  SELECT id INTO henry_id  FROM auth.users WHERE email = 'henry.liu@mock.bracketclub.test';

  SELECT id INTO iron_flame_id  FROM items WHERE title='Iron Flame'                              AND metadata->>'mock'='true';
  SELECT id INTO tomorrow_id    FROM items WHERE title='Tomorrow, and Tomorrow, and Tomorrow'    AND metadata->>'mock'='true';
  SELECT id INTO heaven_id      FROM items WHERE title='The Heaven & Earth Grocery Store'        AND metadata->>'mock'='true';
  SELECT id INTO fourth_wing_id FROM items WHERE title='Fourth Wing'                             AND metadata->>'mock'='true';
  SELECT id INTO demon_id       FROM items WHERE title='Demon Copperhead'                        AND metadata->>'mock'='true';
  SELECT id INTO james_id       FROM items WHERE title='James'                                   AND metadata->>'mock'='true';
  SELECT id INTO funny_id       FROM items WHERE title='Funny Story'                             AND metadata->>'mock'='true';
  SELECT id INTO women_id       FROM items WHERE title='The Women'                               AND metadata->>'mock'='true';
  SELECT id INTO yellowface_id  FROM items WHERE title='Yellowface'                              AND metadata->>'mock'='true';
  SELECT id INTO atomic_id      FROM items WHERE title='Atomic Habits'                           AND metadata->>'mock'='true';
  SELECT id INTO lessons_id     FROM items WHERE title='Lessons in Chemistry'                    AND metadata->>'mock'='true';
  SELECT id INTO wager_id       FROM items WHERE title='The Wager'                               AND metadata->>'mock'='true';
  SELECT id INTO hail_mary_id   FROM items WHERE title='Project Hail Mary'                       AND metadata->>'mock'='true';
  SELECT id INTO evelyn_id      FROM items WHERE title='The Seven Husbands of Evelyn Hugo'       AND metadata->>'mock'='true';
  SELECT id INTO becoming_id    FROM items WHERE title='Becoming'                                AND metadata->>'mock'='true';

  -- Alice — super active (12 books, slot champions, full bracket)
  INSERT INTO shelf_items (user_id, item_id, season_id, slot, user_rating, read_at) VALUES
    (alice_id, iron_flame_id,  season_id_2026, 0, 5, now() - interval '110 days'),
    (alice_id, fourth_wing_id, season_id_2026, 0, 5, now() - interval '105 days'),
    (alice_id, tomorrow_id,    season_id_2026, 1, 5, now() - interval '95 days'),
    (alice_id, heaven_id,      season_id_2026, 2, 4, now() - interval '85 days'),
    (alice_id, demon_id,       season_id_2026, 3, 5, now() - interval '70 days'),
    (alice_id, james_id,       season_id_2026, 3, 5, now() - interval '65 days'),
    (alice_id, funny_id,       season_id_2026, 4, 4, now() - interval '55 days'),
    (alice_id, women_id,       season_id_2026, 5, 4, now() - interval '45 days'),
    (alice_id, yellowface_id,  season_id_2026, 6, 5, now() - interval '35 days'),
    (alice_id, lessons_id,     season_id_2026, 7, 4, now() - interval '25 days'),
    (alice_id, evelyn_id,      season_id_2026, 8, 5, now() - interval '15 days'),
    (alice_id, becoming_id,    season_id_2026, 9, 4, now() - interval '5 days');

  INSERT INTO slot_champions (user_id, season_id, slot, item_id) VALUES
    (alice_id, season_id_2026, 0, iron_flame_id),
    (alice_id, season_id_2026, 1, tomorrow_id),
    (alice_id, season_id_2026, 2, heaven_id),
    (alice_id, season_id_2026, 3, james_id),
    (alice_id, season_id_2026, 6, yellowface_id),
    (alice_id, season_id_2026, 8, evelyn_id);

  INSERT INTO bracket_picks (user_id, season_id, bracket_type, slot, match_id, winner_id) VALUES
    (alice_id, season_id_2026, 'annual', NULL, 'r1_0', iron_flame_id),
    (alice_id, season_id_2026, 'annual', NULL, 'r1_1', tomorrow_id),
    (alice_id, season_id_2026, 'annual', NULL, 'r1_2', james_id),
    (alice_id, season_id_2026, 'annual', NULL, 'r2_0', tomorrow_id),
    (alice_id, season_id_2026, 'annual', NULL, 'final', tomorrow_id);

  INSERT INTO season_champions (user_id, season_id, item_id) VALUES (alice_id, season_id_2026, tomorrow_id);

  -- Ben — super active different taste (sci-fi/nonfiction lean)
  INSERT INTO shelf_items (user_id, item_id, season_id, slot, user_rating, read_at) VALUES
    (ben_id, hail_mary_id, season_id_2026, 0, 5, now() - interval '100 days'),
    (ben_id, atomic_id,    season_id_2026, 0, 4, now() - interval '95 days'),
    (ben_id, wager_id,     season_id_2026, 1, 5, now() - interval '88 days'),
    (ben_id, demon_id,     season_id_2026, 2, 4, now() - interval '78 days'),
    (ben_id, james_id,     season_id_2026, 3, 5, now() - interval '60 days'),
    (ben_id, yellowface_id, season_id_2026, 4, 3, now() - interval '50 days'),
    (ben_id, tomorrow_id,  season_id_2026, 5, 5, now() - interval '40 days'),
    (ben_id, lessons_id,   season_id_2026, 6, 4, now() - interval '30 days'),
    (ben_id, heaven_id,    season_id_2026, 7, 5, now() - interval '20 days'),
    (ben_id, becoming_id,  season_id_2026, 8, 4, now() - interval '10 days');

  INSERT INTO slot_champions (user_id, season_id, slot, item_id) VALUES
    (ben_id, season_id_2026, 0, hail_mary_id),
    (ben_id, season_id_2026, 1, wager_id),
    (ben_id, season_id_2026, 3, james_id),
    (ben_id, season_id_2026, 5, tomorrow_id),
    (ben_id, season_id_2026, 7, heaven_id);

  INSERT INTO bracket_picks (user_id, season_id, bracket_type, slot, match_id, winner_id) VALUES
    (ben_id, season_id_2026, 'annual', NULL, 'r1_0', hail_mary_id),
    (ben_id, season_id_2026, 'annual', NULL, 'r1_1', james_id),
    (ben_id, season_id_2026, 'annual', NULL, 'final', james_id);

  -- Carmen — medium active (7 books, a few winners)
  INSERT INTO shelf_items (user_id, item_id, season_id, slot, user_rating, read_at) VALUES
    (carmen_id, iron_flame_id, season_id_2026, 0, 5, now() - interval '55 days'),
    (carmen_id, funny_id,      season_id_2026, 1, 5, now() - interval '48 days'),
    (carmen_id, evelyn_id,     season_id_2026, 2, 5, now() - interval '40 days'),
    (carmen_id, women_id,      season_id_2026, 3, 4, now() - interval '32 days'),
    (carmen_id, lessons_id,    season_id_2026, 4, 5, now() - interval '24 days'),
    (carmen_id, fourth_wing_id, season_id_2026, 5, 5, now() - interval '16 days'),
    (carmen_id, tomorrow_id,   season_id_2026, 6, 4, now() - interval '8 days');

  INSERT INTO slot_champions (user_id, season_id, slot, item_id) VALUES
    (carmen_id, season_id_2026, 0, iron_flame_id),
    (carmen_id, season_id_2026, 2, evelyn_id),
    (carmen_id, season_id_2026, 5, fourth_wing_id);

  -- David — medium (6 books)
  INSERT INTO shelf_items (user_id, item_id, season_id, slot, user_rating, read_at) VALUES
    (david_id, atomic_id,    season_id_2026, 0, 4, now() - interval '40 days'),
    (david_id, hail_mary_id, season_id_2026, 1, 5, now() - interval '32 days'),
    (david_id, wager_id,     season_id_2026, 2, 4, now() - interval '24 days'),
    (david_id, demon_id,     season_id_2026, 3, 5, now() - interval '16 days'),
    (david_id, james_id,     season_id_2026, 4, 5, now() - interval '12 days'),
    (david_id, yellowface_id, season_id_2026, 5, 3, now() - interval '4 days');

  INSERT INTO slot_champions (user_id, season_id, slot, item_id) VALUES
    (david_id, season_id_2026, 1, hail_mary_id),
    (david_id, season_id_2026, 3, demon_id);

  -- Emma — medium (5 books)
  INSERT INTO shelf_items (user_id, item_id, season_id, slot, user_rating, read_at) VALUES
    (emma_id, women_id,      season_id_2026, 0, 5, now() - interval '25 days'),
    (emma_id, becoming_id,   season_id_2026, 1, 5, now() - interval '20 days'),
    (emma_id, lessons_id,    season_id_2026, 2, 4, now() - interval '15 days'),
    (emma_id, heaven_id,     season_id_2026, 3, 5, now() - interval '10 days'),
    (emma_id, evelyn_id,     season_id_2026, 4, 4, now() - interval '5 days');

  INSERT INTO slot_champions (user_id, season_id, slot, item_id) VALUES
    (emma_id, season_id_2026, 1, becoming_id);

  -- Felix — light (3 books, no winners yet)
  INSERT INTO shelf_items (user_id, item_id, season_id, slot, user_rating, read_at) VALUES
    (felix_id, fourth_wing_id, season_id_2026, 0, 4, now() - interval '15 days'),
    (felix_id, iron_flame_id,  season_id_2026, 1, NULL, NULL),
    (felix_id, funny_id,       season_id_2026, 2, NULL, NULL);

  -- Gina — light (2 books)
  INSERT INTO shelf_items (user_id, item_id, season_id, slot, user_rating, read_at) VALUES
    (gina_id, atomic_id,  season_id_2026, 0, 3, now() - interval '8 days'),
    (gina_id, becoming_id, season_id_2026, 1, NULL, NULL);

  -- Henry — fresh signup, no shelf yet (intentional)
END
$mock$;
