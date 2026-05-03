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
import { createStore, freshData, freshTrendingData } from "../shared/storage.js";
import { getTrendingPrefs, setTrendingPrefs } from "../shared/trendingPreferences.js";

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

// Upsert a book into the shared items catalog and return its UUID.
// Uses goodreads_id if present, otherwise matches on title+creator.
export async function ensureItem(book, categoryId) {
  if (!supabase) return null;

  const goodreadsId = book.goodreadsId || book.id || null;
  // creators is always an array — handles co-authors, director+writers, studio+publisher
  const creators = book.creators || (book.author ? [book.author] : []);
  const payload = {
    category_id:  categoryId,
    title:        book.title || "",
    creators,
    cover_url:    book.cover  || book.cover_url || null,
    description:  book.description || null,
    genres:       book.categories || [],
    tags:         book.tags || [],
    metadata:     book.metadata || {},
    external_ids: goodreadsId ? { goodreads_id: String(goodreadsId) } : {},
    // Track which source enriched this and when — replaces flat enriched_at
    data_sources: book._enriched ? {
      open_library: { fetched_at: new Date().toISOString(), fields: ["genres", "tags"] },
    } : {},
  };

  // Try to find an existing item by goodreads_id first
  if (goodreadsId) {
    const { data } = await supabase
      .from("items")
      .select("id")
      .eq("external_ids->>'goodreads_id'", String(goodreadsId))
      .maybeSingle();
    if (data?.id) {
      // Update enrichment fields if we have fresh data
      await supabase.from("items").update({
        genres: payload.genres,
        tags:   payload.tags,
        cover_url: payload.cover_url || undefined,
        enriched_at: book._enriched ? new Date().toISOString() : undefined,
      }).eq("id", data.id);
      return data.id;
    }
  }

  // Upsert by title + creator (best effort dedup without external IDs)
  const { data, error } = await supabase
    .from("items")
    .upsert(payload, { onConflict: "external_ids->>'goodreads_id'" })
    .select("id")
    .single();

  if (error || !data) {
    // Fall back: insert without conflict resolution
    const { data: inserted } = await supabase
      .from("items")
      .insert(payload)
      .select("id")
      .single();
    return inserted?.id || null;
  }
  return data.id;
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
    const itemId = await ensureItem(book, categoryId);
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

  const itemId = await ensureItem(book, categoryId);
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

  const itemId = await ensureItem(winnerBook, categoryId);
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

  const itemId = await ensureItem(book, categoryId);
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
    const uuid = await ensureItem(b, categoryId);
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

// ─── Trending preferences ─────────────────────────────────────────────────────

export async function loadTrendingPrefs(userId, categoryId) {
  if (!supabase || !userId) {
    return getTrendingPrefs(categoryId);
  }

  const { data, error } = await supabase
    .from("trending_preferences")
    .select("*")
    .eq("user_id", userId)
    .eq("category_id", categoryId)
    .maybeSingle();

  if (error || !data) return getTrendingPrefs(categoryId);

  return {
    onboardingCompleted:   true,
    personalizationEnabled: data.personalization_enabled,
    preferences: {
      selectedCategories: data.selected_categories || [],
      selectedTags:       data.selected_tags || [],
      excludedTags:       data.excluded_tags || [],
      discoveryMode:      data.discovery_mode || "balanced",
    },
  };
}

export async function saveTrendingPrefs(userId, categoryId, prefs) {
  // Always persist locally first so there's no latency on next load
  setTrendingPrefs(categoryId, prefs);

  if (!supabase || !userId) return;

  await supabase.from("trending_preferences").upsert({
    user_id:                userId,
    category_id:            categoryId,
    personalization_enabled: prefs.personalizationEnabled ?? false,
    selected_categories:    prefs.preferences?.selectedCategories || [],
    selected_tags:          prefs.preferences?.selectedTags || [],
    excluded_tags:          prefs.preferences?.excludedTags || [],
    discovery_mode:         prefs.preferences?.discoveryMode || "balanced",
    updated_at:             new Date().toISOString(),
  }, { onConflict: "user_id,category_id" });
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
