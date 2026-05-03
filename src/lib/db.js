/**
 * db.js — Supabase data access layer.
 *
 * Mirrors the localStorage API in storage.js and trendingPreferences.js but
 * persists to Supabase. Falls back to localStorage when the client is not
 * configured (no env vars) or when the user is not signed in.
 *
 * Conversion:
 *   App format   ← → DB tables
 *   book object  ← → items + shelf_items (joined)
 *   month winner ← → slot_champions
 *   bracket pick ← → bracket_picks
 *   prefs object ← → trending_preferences
 *
 * All public functions are async and return the same shapes as their storage.js
 * counterparts so call sites can swap implementations transparently.
 */

import { supabase } from "./supabase.js";
import { createStore, freshData } from "../shared/storage.js";

// ─── Local fallbacks ──────────────────────────────────────────────────────────

const localShelf   = createStore("botb_");
const localPop     = createStore("botb_pop_");

// ─── Season cache (avoid repeated DB lookups) ─────────────────────────────────

const seasonCache = new Map(); // "books:2025" → uuid

async function getSeasonId(categoryId, year) {
  const key = `${categoryId}:${year}`;
  if (seasonCache.has(key)) return seasonCache.get(key);
  const { data, error } = await supabase
    .from("seasons")
    .select("id")
    .eq("category_id", categoryId)
    .eq("year", year)
    .single();
  if (error || !data) return null;
  seasonCache.set(key, data.id);
  return data.id;
}

// ─── Items (shared catalog) ───────────────────────────────────────────────────

/**
 * Upsert a book into the shared items catalog and return its UUID.
 *
 * Dedup priority — first match wins, subsequent users reuse the same row:
 *   1. (source='google_books', source_id=googleBooksId)  ← seeded catalog
 *   2. external_ids->>'isbn_13' = isbn13
 *   3. external_ids->>'goodreads_id' = goodreadsId       ← legacy RSS imports
 *
 * If nothing matches, inserts a new user-owned row.  The new row carries
 * source/source_id when we have them so the *next* user adding the same
 * book will reuse this row instead of creating a third copy.
 *
 * RLS requires non-admin inserts to set created_by_user_id = auth.uid().
 * userId must be passed for user-initiated saves.
 */
// UUID v4 shape — used to detect books that came back from loadShelf already
// tracked in items.  These don't need re-insertion; just trust the id.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function ensureItem(book, categoryId, userId = null) {
  if (!supabase) return null;

  // Short-circuit: book.id looks like a UUID → already in items, reuse it
  // (avoids creating a duplicate row every time we save a previously-loaded
  // shelf).  Cheap O(1) check before any network round-trip.
  if (typeof book.id === "string" && UUID_RE.test(book.id)) return book.id;

  const googleBooksId = book.googleBooksId || null;
  const isbn13        = book.isbn13 || null;
  const goodreadsId   = book.goodreadsId || null;
  const creators      = book.creators || (book.author ? [book.author] : []);

  // 1. Match by Google Books ID — covers the seeded catalog (240 books) AND
  //    any prior user add that came through the search tool.
  if (googleBooksId) {
    const { data } = await supabase
      .from("items")
      .select("id")
      .eq("source", "google_books")
      .eq("source_id", googleBooksId)
      .maybeSingle();
    if (data?.id) return data.id;
  }

  // 2. Match by ISBN-13 — catches catalog rows seeded with an ISBN even if
  //    the user search didn't return a googleBooksId for the same edition.
  if (isbn13) {
    const { data } = await supabase
      .from("items")
      .select("id")
      .eq("external_ids->>isbn_13", isbn13)
      .maybeSingle();
    if (data?.id) return data.id;
  }

  // 3. Match by legacy Goodreads ID (Goodreads RSS import path).
  if (goodreadsId) {
    const { data } = await supabase
      .from("items")
      .select("id")
      .eq("external_ids->>goodreads_id", String(goodreadsId))
      .maybeSingle();
    if (data?.id) return data.id;
  }

  // 4. No match — insert a new row.  Build external_ids from whatever we have.
  const externalIds = {};
  if (googleBooksId) externalIds.google_books_id = googleBooksId;
  if (isbn13)        externalIds.isbn_13         = isbn13;
  if (goodreadsId)   externalIds.goodreads_id    = String(goodreadsId);

  const payload = {
    category_id:        categoryId,
    title:              book.title || "",
    creators,
    cover_url:          book.cover || book.cover_url || null,
    description:        book.description || null,
    genres:             book.categories || book.genres || [],
    tags:               book.tags || [],
    metadata:           book.metadata || {},
    external_ids:       externalIds,
    // RLS: non-admins MUST insert with created_by_user_id = auth.uid()
    created_by_user_id: userId,
    is_verified:        false,
    // Set source so the next user adding the same Google-Books-sourced book
    // dedups against this row via path #1 above instead of creating a third.
    source:             googleBooksId ? "google_books" : null,
    source_id:          googleBooksId || null,
    data_sources:       book._enriched ? {
      open_library: { fetched_at: new Date().toISOString(), fields: ["genres", "tags"] },
    } : {},
  };

  const { data: inserted, error } = await supabase
    .from("items")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    // Race condition: another tab inserted the same source_id between our
    // check and our insert.  Refetch and return whichever row won.
    if (error.code === "23505" && googleBooksId) {        // unique_violation
      const { data: retry } = await supabase
        .from("items")
        .select("id")
        .eq("source", "google_books")
        .eq("source_id", googleBooksId)
        .maybeSingle();
      if (retry?.id) return retry.id;
    }
    console.error("ensureItem insert failed:", error.message);
    return null;
  }
  return inserted?.id || null;
}

// ─── Shelf data ───────────────────────────────────────────────────────────────

// Load a user's full shelf for a category+year, shaped like freshData().
// Falls back to localStorage if supabase is unavailable or user is null.
export async function loadShelf(userId, categoryId, year) {
  if (!supabase || !userId) {
    return localShelf.get(year) || freshData();
  }

  const seasonId = await getSeasonId(categoryId, year);
  if (!seasonId) return localShelf.get(year) || freshData();

  const [shelfRes, champRes, picksRes] = await Promise.all([
    supabase
      .from("shelf_items")
      .select("slot, user_rating, read_at, notes, items(id, title, creators, cover_url, description, genres, tags, external_ids)")
      .eq("user_id", userId)
      .eq("season_id", seasonId),
    supabase
      .from("slot_champions")
      .select("slot, items(id, title, creators, cover_url, description)")
      .eq("user_id", userId)
      .eq("season_id", seasonId),
    supabase
      .from("bracket_picks")
      .select("bracket_type, slot, match_id, winner_id")
      .eq("user_id", userId)
      .eq("season_id", seasonId),
  ]);

  const data = freshData();

  // Shelf items → months[slot].books
  for (const row of shelfRes.data || []) {
    const slot = row.slot;
    if (slot < 0 || slot >= data.months.length) continue;
    const item = row.items;
    if (!item) continue;
    data.months[slot].books.push({
      id:          item.id,
      title:       item.title,
      author:      item.creators?.[0] || "",
      creators:    item.creators || [],
      cover:       item.cover_url || "",
      description: item.description || "",
      categories:  item.genres || [],
      tags:        item.tags || [],
      rating:      row.user_rating || null,
      readAt:      row.read_at || null,
      notes:       row.notes || null,
      _enriched:   item.genres?.length > 0,
    });
  }

  // Slot champions → months[slot].winner
  for (const row of champRes.data || []) {
    const slot = row.slot;
    if (slot < 0 || slot >= data.months.length) continue;
    const item = row.items;
    if (!item) continue;
    data.months[slot].winner = {
      id:       item.id,
      title:    item.title,
      author:   item.creators?.[0] || "",
      creators: item.creators || [],
      cover:    item.cover_url || "",
    };
  }

  // Bracket picks → bracket object
  for (const row of picksRes.data || []) {
    if (row.bracket_type === "annual") {
      data.bracket[row.match_id] = row.winner_id;
    } else {
      // slot bracket picks aren't currently in the bracket object shape,
      // stored per-month — ignored at this level
    }
  }

  return data;
}

// Save an entire month's book list to shelf_items.
// Call after user adds/removes a book from a slot.
export async function saveShelfMonth(userId, categoryId, year, slot, books) {
  if (!supabase || !userId) return;

  const seasonId = await getSeasonId(categoryId, year);
  if (!seasonId) return;

  // Delete existing rows for this slot, then re-insert
  await supabase
    .from("shelf_items")
    .delete()
    .eq("user_id", userId)
    .eq("season_id", seasonId)
    .eq("slot", slot);

  for (const book of books) {
    const itemId = await ensureItem(book, categoryId, userId);
    if (!itemId) continue;
    await supabase.from("shelf_items").insert({
      user_id:     userId,
      item_id:     itemId,
      season_id:   seasonId,
      slot,
      user_rating: book.rating || null,
      read_at:     book.readAt || null,
      notes:       book.notes || null,
    });
  }
}

// Set or clear the slot champion (month winner).
export async function saveSlotChampion(userId, categoryId, year, slot, book) {
  if (!supabase || !userId) return;

  const seasonId = await getSeasonId(categoryId, year);
  if (!seasonId) return;

  if (!book) {
    await supabase
      .from("slot_champions")
      .delete()
      .eq("user_id", userId)
      .eq("season_id", seasonId)
      .eq("slot", slot);
    return;
  }

  const itemId = await ensureItem(book, categoryId, userId);
  if (!itemId) return;

  await supabase.from("slot_champions").upsert({
    user_id:   userId,
    season_id: seasonId,
    slot,
    item_id:   itemId,
  }, { onConflict: "user_id,season_id,slot" });
}

// Save a bracket pick (annual bracket).
export async function saveBracketPick(userId, categoryId, year, matchId, winnerBook) {
  if (!supabase || !userId) return;

  const seasonId = await getSeasonId(categoryId, year);
  if (!seasonId) return;

  if (!winnerBook) {
    await supabase
      .from("bracket_picks")
      .delete()
      .eq("user_id", userId)
      .eq("season_id", seasonId)
      .eq("bracket_type", "annual")
      .eq("match_id", matchId);
    return;
  }

  const itemId = await ensureItem(winnerBook, categoryId, userId);
  if (!itemId) return;

  await supabase.from("bracket_picks").upsert({
    user_id:      userId,
    season_id:    seasonId,
    bracket_type: "annual",
    slot:         null,
    match_id:     matchId,
    winner_id:    itemId,
  }, { onConflict: "user_id,season_id,bracket_type,slot,match_id" });
}

// Set the season champion (annual bracket winner).
export async function saveSeasonChampion(userId, categoryId, year, book) {
  if (!supabase || !userId) return;

  const seasonId = await getSeasonId(categoryId, year);
  if (!seasonId) return;

  if (!book) {
    await supabase
      .from("season_champions")
      .delete()
      .eq("user_id", userId)
      .eq("season_id", seasonId);
    return;
  }

  const itemId = await ensureItem(book, categoryId, userId);
  if (!itemId) return;

  await supabase.from("season_champions").upsert({
    user_id:   userId,
    season_id: seasonId,
    item_id:   itemId,
  }, { onConflict: "user_id,season_id" });
}

// ─── Full-shelf sync (called by App.jsx after every state change) ────────────
//
// App.jsx mutates the entire data blob then calls save(nd). Rather than diffing,
// we just push the whole shelf for that year. For a typical user (12 months,
// ~24 books, a bracket) this is ~50 row writes — fine to fire-and-forget.
//
// Debounce upstream so we don't hammer Supabase during rapid edits.

export async function syncShelfData(userId, categoryId, year, data) {
  if (!supabase || !userId) return;

  const seasonId = await getSeasonId(categoryId, year);
  if (!seasonId) return;

  // 1. Resolve every book in the blob to an item UUID once, parallelized
  const allBooks = data.months.flatMap(m => [
    ...(m.books || []),
    ...(m.winner ? [m.winner] : []),
  ]);
  const idMap = new Map(); // book.id (local) → item.id (uuid)
  await Promise.all(allBooks.map(async b => {
    if (!b || idMap.has(b.id)) return;
    const uuid = await ensureItem(b, categoryId, userId);
    if (uuid) idMap.set(b.id, uuid);
  }));

  // 2. Wipe the old season state then re-insert from the current blob.
  //    Done in parallel — no FKs between these tables block deletion.
  await Promise.all([
    supabase.from("shelf_items").delete().eq("user_id", userId).eq("season_id", seasonId),
    supabase.from("slot_champions").delete().eq("user_id", userId).eq("season_id", seasonId),
    supabase.from("bracket_picks").delete().eq("user_id", userId).eq("season_id", seasonId).eq("bracket_type", "annual"),
  ]);

  const shelfRows = [];
  const champRows = [];
  data.months.forEach((m, slot) => {
    (m.books || []).forEach(b => {
      const itemId = idMap.get(b.id);
      if (!itemId) return;
      shelfRows.push({
        user_id: userId, item_id: itemId, season_id: seasonId, slot,
        user_rating: b.rating || null,
        read_at:     b.readAt || null,
        notes:       b.notes  || null,
      });
    });
    if (m.winner) {
      const itemId = idMap.get(m.winner.id);
      if (itemId) champRows.push({ user_id: userId, season_id: seasonId, slot, item_id: itemId });
    }
  });

  const pickRows = Object.entries(data.bracket || {}).map(([matchId, winnerLocalId]) => {
    const itemId = idMap.get(winnerLocalId);
    if (!itemId) return null;
    return {
      user_id:      userId,
      season_id:    seasonId,
      bracket_type: "annual",
      slot:         null,
      match_id:     matchId,
      winner_id:    itemId,
    };
  }).filter(Boolean);

  await Promise.all([
    shelfRows.length && supabase.from("shelf_items").insert(shelfRows),
    champRows.length && supabase.from("slot_champions").insert(champRows),
    pickRows.length  && supabase.from("bracket_picks").insert(pickRows),
  ].filter(Boolean));
}

// ─── New Releases (curated catalog) ──────────────────────────────────────────

/**
 * Fetch admin-verified items ordered by release date descending.
 * Optionally filter to a specific year or month.
 *
 * @param {{ year?: number, month?: number, limit?: number }} opts
 * @returns {Promise<Array>}
 */
export async function getNewReleases({ year, month, limit = 100 } = {}) {
  if (!supabase) return [];
  let q = supabase
    .from("items")
    .select("id, title, creators, cover_url, description, genres, tags, published_at, published_year, published_month, external_ids, metadata")
    .eq("is_verified", true)
    .not("published_at", "is", null)
    .order("published_at", { ascending: false })
    .limit(limit);
  if (year)  q = q.eq("published_year",  year);
  if (month) q = q.eq("published_month", month);
  const { data, error } = await q;
  if (error) { console.error("getNewReleases error:", error); return []; }
  return data || [];
}

/**
 * For a year-overview grid (Jan…Dec), return the single most-popular release
 * per month.  Returns a sparse map { 0: book, 1: book, … 11: book } — months
 * with no releases in the catalog are omitted.
 *
 * Popularity is read from metadata.popularity_score (set during the seed
 * pipeline from Open Library's edition_count); books without a score sort to
 * the bottom by a NULLs-last fallback.
 */
export async function getReleasesGridForYear(year) {
  if (!supabase) return {};
  const { data, error } = await supabase
    .from("items")
    .select("id, title, creators, cover_url, published_year, published_month, metadata")
    .eq("is_verified", true)
    .eq("published_year", year)
    .not("published_month", "is", null);
  if (error) { console.error("getReleasesGridForYear error:", error); return {}; }

  // Group by month → keep the highest popularity_score per bucket.
  const byMonth = {};
  for (const row of data || []) {
    const m = row.published_month - 1;            // 1-12 → 0-11
    if (m < 0 || m > 11) continue;
    const score = row.metadata?.popularity_score ?? 0;
    if (!byMonth[m] || score > (byMonth[m].metadata?.popularity_score ?? 0)) {
      byMonth[m] = row;
    }
  }
  return byMonth;
}

/**
 * Full list of releases for a given year + month, sorted by popularity desc.
 * Used by the month-detail view inside the New Releases tab.
 */
export async function getReleasesForMonth(year, month) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("items")
    .select("id, title, creators, cover_url, description, genres, tags, published_at, published_year, published_month, external_ids, metadata")
    .eq("is_verified", true)
    .eq("published_year",  year)
    .eq("published_month", month);
  if (error) { console.error("getReleasesForMonth error:", error); return []; }
  // Sort client-side by popularity_score (Postgres can't easily order by jsonb numeric)
  return (data || []).sort((a, b) =>
    (b.metadata?.popularity_score ?? 0) - (a.metadata?.popularity_score ?? 0)
  );
}

/**
 * Upsert a verified catalog item (admin only — enforced by DB policy).
 * Deduplicates by google_books_id stored in external_ids.
 *
 * @param {object} book  Normalised book from the Google Books proxy
 * @param {string} categoryId
 * @returns {Promise<string|null>}  The item UUID, or null on failure
 */
export async function upsertVerifiedItem(book, categoryId) {
  if (!supabase) return null;

  // Parse published_at — Google Books gives "2024-09-26", "2024-09", or "2024"
  let publishedAt     = null;
  let publishedYear   = null;
  let publishedMonth  = null;
  if (book.publishedDate) {
    const parts = book.publishedDate.split("-");
    publishedYear  = parts[0] ? parseInt(parts[0], 10) : null;
    publishedMonth = parts[1] ? parseInt(parts[1], 10) : null;
    if (publishedYear && publishedMonth) {
      publishedAt = `${parts[0]}-${parts[1].padStart(2, "0")}-${(parts[2] || "01").padStart(2, "0")}`;
    } else if (publishedYear) {
      publishedAt = `${parts[0]}-01-01`;
    }
  }

  const payload = {
    category_id:    categoryId,
    title:          book.title || "",
    creators:       book.authors || [],
    cover_url:      book.coverUrl || null,
    description:    book.description || null,
    genres:         book.genres || [],
    tags:           [],
    external_ids:   { google_books_id: book.googleBooksId },
    metadata:       {
      isbn13:       book.isbn13 || null,
      page_count:   book.pageCount || null,
      language:     book.language || null,
      preview_link: book.previewLink || null,
    },
    published_at:    publishedAt,
    published_year:  publishedYear,
    published_month: publishedMonth,
    is_verified:     true,
    source:          "google_books",
    source_id:       book.googleBooksId,
  };

  // Check for existing item by google_books_id to avoid duplicates
  const { data: existing } = await supabase
    .from("items")
    .select("id")
    .eq("source", "google_books")
    .eq("source_id", book.googleBooksId)
    .maybeSingle();

  if (existing?.id) {
    // Update in place
    await supabase.from("items").update(payload).eq("id", existing.id);
    return existing.id;
  }

  const { data, error } = await supabase
    .from("items")
    .insert(payload)
    .select("id")
    .single();

  if (error) { console.error("upsertVerifiedItem error:", error); return null; }
  return data?.id || null;
}

/**
 * Remove a verified item from the catalog (admin only).
 * Soft-removes by setting is_verified = false rather than deleting,
 * so user shelf references aren't broken.
 */
export async function removeVerifiedItem(itemId) {
  if (!supabase) return;
  await supabase
    .from("items")
    .update({ is_verified: false })
    .eq("id", itemId);
}

// ─── Admin queries ───────────────────────────────────────────────────────────
// These read from views that filter on is_admin() — non-admins get zero rows.

export async function loadAdminUserSummary() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("admin_user_summary")
    .select("*")
    .order("signed_up_at", { ascending: false });
  if (error) { console.error("admin_user_summary error:", error); return []; }
  return data || [];
}

export async function loadAdminPlatformStats() {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("admin_platform_stats")
    .select("*")
    .maybeSingle();
  if (error) { console.error("admin_platform_stats error:", error); return null; }
  return data;
}

// ─── localStorage → Supabase migration ───────────────────────────────────────

// Call once after a user signs in for the first time.
// Reads any data in localStorage and pushes it to Supabase.
export async function migrateLocalStorageToSupabase(userId, categoryId, year) {
  if (!supabase || !userId) return;

  const seasonId = await getSeasonId(categoryId, year);
  if (!seasonId) return;

  // Check if they already have data in the DB
  const { count } = await supabase
    .from("shelf_items")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("season_id", seasonId);

  if (count > 0) return; // already migrated

  const local = localShelf.get(year);
  if (!local?.months) return;

  for (let slot = 0; slot < local.months.length; slot++) {
    const month = local.months[slot];
    if (month.books?.length) {
      await saveShelfMonth(userId, categoryId, year, slot, month.books);
    }
    if (month.winner) {
      await saveSlotChampion(userId, categoryId, year, slot, month.winner);
    }
  }

  // Annual bracket picks
  const bracket = local.bracket || {};
  for (const [matchId, winnerId] of Object.entries(bracket)) {
    // winnerId is a goodreads ID string in local storage — find the book object
    const book = local.months.flatMap(m => m.books || []).find(b => String(b.id) === String(winnerId));
    if (book) await saveBracketPick(userId, categoryId, year, matchId, book);
  }
}
