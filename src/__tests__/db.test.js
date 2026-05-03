/**
 * db.test.js
 *
 * Tests for the Supabase data access layer (src/lib/db.js).
 *
 * The supabase client is fully mocked. We're testing the conversion logic
 * (app book format ↔ DB rows), the graceful no-op behavior when the user is
 * not signed in, and the localStorage-fallback wiring.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mock the supabase client ────────────────────────────────────────────────
// We need to stub out src/lib/supabase.js BEFORE db.js is imported so that
// the module-scope `supabase` reference in db.js gets our mock.

const calls = [];
let supabaseMock;

vi.mock("../lib/supabase.js", () => {
  // The mock client is a chainable proxy that records every call so each test
  // can assert on what was sent. Reset between tests via `setupSupabase()`.
  const makeChain = (table) => {
    const chain = {
      _table: table,
      select: vi.fn(function () { calls.push({ op: "select", table }); return chain; }),
      insert: vi.fn(function (rows) { calls.push({ op: "insert", table, rows }); return chain; }),
      upsert: vi.fn(function (rows, opts) { calls.push({ op: "upsert", table, rows, opts }); return chain; }),
      update: vi.fn(function (data) { calls.push({ op: "update", table, data }); return chain; }),
      delete: vi.fn(function () { calls.push({ op: "delete", table }); return chain; }),
      eq: vi.fn(function (col, val) { calls.push({ op: "eq", table, col, val }); return chain; }),
      single: vi.fn(() => Promise.resolve({ data: null, error: null })),
      maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
      then: undefined,
    };
    // Make the chain itself thenable so `await chain` works for terminal ops
    chain.then = (resolve) => resolve({ data: null, error: null });
    return chain;
  };
  return {
    get supabase() { return supabaseMock; },
    __setMock: (m) => { supabaseMock = m; },
    __makeChain: makeChain,
  };
});

// Now import db.js — it will pick up the mocked supabase reference
const db = await import("../lib/db.js");
const supabaseModule = await import("../lib/supabase.js");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function setupSupabase({ seasonId = "season-uuid-1" } = {}) {
  calls.length = 0;
  // Build a mock client that returns chains and resolves season lookups
  const client = {
    from: vi.fn((table) => {
      const chain = supabaseModule.__makeChain(table);
      // Special-case: looking up a season returns a fake UUID
      if (table === "seasons") {
        chain.single = vi.fn(() => Promise.resolve({
          data: seasonId ? { id: seasonId } : null,
          error: seasonId ? null : new Error("not found"),
        }));
      }
      return chain;
    }),
  };
  supabaseModule.__setMock(client);
  return client;
}

beforeEach(() => {
  localStorage.clear();
  calls.length = 0;
});

afterEach(() => {
  supabaseModule.__setMock(null);
});

// ─── Graceful no-op when supabase or user is missing ─────────────────────────

describe("db.js — graceful no-op without supabase or user", () => {
  it("loadShelf falls back to localStorage when supabase is null", async () => {
    supabaseModule.__setMock(null);
    localStorage.setItem("botb_2026", JSON.stringify({ months: [{ books: [], winner: null }], bracket: {} }));
    const data = await db.loadShelf(null, "books", 2026);
    expect(data.months).toBeDefined();
    expect(data.bracket).toEqual({});
  });

  it("loadShelf returns freshData when no user and no localStorage", async () => {
    supabaseModule.__setMock(null);
    const data = await db.loadShelf(null, "books", 2026);
    expect(data.months).toHaveLength(12);
    expect(data.bracket).toEqual({});
  });

  it("syncShelfData does nothing when no user", async () => {
    setupSupabase();
    await db.syncShelfData(null, "books", 2026, { months: [], bracket: {} });
    expect(calls).toHaveLength(0);
  });

  it("ensureItem returns null when supabase is not configured", async () => {
    supabaseModule.__setMock(null);
    const id = await db.ensureItem({ title: "X", author: "Y" }, "books");
    expect(id).toBeNull();
  });

  it("saveTrendingPrefs writes to localStorage even when no user", async () => {
    supabaseModule.__setMock(null);
    await db.saveTrendingPrefs(null, "books", {
      personalizationEnabled: true,
      preferences: { selectedCategories: ["fantasy"], selectedTags: [], excludedTags: [], discoveryMode: "balanced" },
    });
    const raw = JSON.parse(localStorage.getItem("bracket_club_trending_prefs"));
    expect(raw.books.personalizationEnabled).toBe(true);
    expect(raw.books.preferences.selectedCategories).toEqual(["fantasy"]);
  });
});

// ─── ensureItem: catalog upsert ──────────────────────────────────────────────

describe("db.js — ensureItem", () => {
  it("includes creators array, external_ids, and data_sources in payload", async () => {
    const client = setupSupabase();
    // Make insert chain return a fake item id
    client.from = vi.fn((table) => {
      const chain = supabaseModule.__makeChain(table);
      chain.single = vi.fn(() => Promise.resolve({ data: { id: "item-uuid" }, error: null }));
      chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
      return chain;
    });

    await db.ensureItem({
      id: "gr-123",
      title: "Dune",
      author: "Frank Herbert",
      cover: "http://cover",
      description: "Sci-fi epic",
      categories: ["sci_fi"],
      tags: ["page_turners"],
      _enriched: true,
    }, "books");

    const upsertCall = calls.find(c => c.op === "upsert" && c.table === "items");
    expect(upsertCall).toBeDefined();
    expect(upsertCall.rows.creators).toEqual(["Frank Herbert"]);
    expect(upsertCall.rows.external_ids).toEqual({ goodreads_id: "gr-123" });
    expect(upsertCall.rows.genres).toEqual(["sci_fi"]);
    expect(upsertCall.rows.data_sources.open_library).toBeDefined();
  });

  it("preserves an existing creators[] array when present", async () => {
    const client = setupSupabase();
    client.from = vi.fn((table) => {
      const chain = supabaseModule.__makeChain(table);
      chain.single = vi.fn(() => Promise.resolve({ data: { id: "item-uuid" }, error: null }));
      chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
      return chain;
    });

    await db.ensureItem({
      title: "Good Omens",
      creators: ["Neil Gaiman", "Terry Pratchett"],
    }, "books");

    const upsertCall = calls.find(c => c.op === "upsert" && c.table === "items");
    expect(upsertCall.rows.creators).toEqual(["Neil Gaiman", "Terry Pratchett"]);
  });

  it("does not write data_sources when book is not _enriched", async () => {
    const client = setupSupabase();
    client.from = vi.fn((table) => {
      const chain = supabaseModule.__makeChain(table);
      chain.single = vi.fn(() => Promise.resolve({ data: { id: "item-uuid" }, error: null }));
      chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
      return chain;
    });

    await db.ensureItem({ title: "X", author: "Y" }, "books");
    const upsertCall = calls.find(c => c.op === "upsert" && c.table === "items");
    expect(upsertCall.rows.data_sources).toEqual({});
  });
});

// ─── Trending preferences ────────────────────────────────────────────────────

describe("db.js — saveTrendingPrefs", () => {
  it("upserts to trending_preferences and writes localStorage", async () => {
    const client = setupSupabase();
    await db.saveTrendingPrefs("user-1", "books", {
      personalizationEnabled: true,
      preferences: {
        selectedCategories: ["fantasy", "sci_fi"],
        selectedTags: ["page_turners"],
        excludedTags: ["romance_heavy"],
        discoveryMode: "taste_first",
      },
    });

    // localStorage write happened
    const raw = JSON.parse(localStorage.getItem("bracket_club_trending_prefs"));
    expect(raw.books.personalizationEnabled).toBe(true);

    // Supabase upsert happened with snake_case columns
    const upsert = calls.find(c => c.op === "upsert" && c.table === "trending_preferences");
    expect(upsert).toBeDefined();
    expect(upsert.rows.user_id).toBe("user-1");
    expect(upsert.rows.category_id).toBe("books");
    expect(upsert.rows.personalization_enabled).toBe(true);
    expect(upsert.rows.selected_categories).toEqual(["fantasy", "sci_fi"]);
    expect(upsert.rows.discovery_mode).toBe("taste_first");
  });
});

// ─── localStorage → Supabase migration ───────────────────────────────────────

describe("db.js — migrateLocalStorageToSupabase", () => {
  it("does nothing when there is no localStorage data", async () => {
    setupSupabase();
    // shelf_items count check returns 0 so migration would proceed
    await db.migrateLocalStorageToSupabase("user-1", "books", 2026);
    // No insert/upsert calls beyond the initial count check
    const dataCalls = calls.filter(c => c.op === "insert" || c.op === "upsert");
    expect(dataCalls).toHaveLength(0);
  });

  it("does nothing when DB already has shelf_items for the user+season", async () => {
    const client = setupSupabase();
    // Make the count query return >0 — simulating already-migrated state
    client.from = vi.fn((table) => {
      const chain = supabaseModule.__makeChain(table);
      if (table === "seasons") {
        chain.single = vi.fn(() => Promise.resolve({ data: { id: "season-uuid-1" }, error: null }));
      }
      if (table === "shelf_items") {
        chain.select = vi.fn(() => {
          // Mimic { count: N, head: true } behavior — chain still acts as thenable
          chain.then = (resolve) => resolve({ count: 5, error: null });
          return chain;
        });
      }
      return chain;
    });

    localStorage.setItem("botb_2026", JSON.stringify({
      months: [{ books: [{ id: "1", title: "X", author: "Y" }], winner: null }],
      bracket: {},
    }));

    await db.migrateLocalStorageToSupabase("user-1", "books", 2026);

    const inserts = calls.filter(c => c.op === "insert");
    expect(inserts).toHaveLength(0);
  });
});

// ─── syncShelfData (the App.jsx save() target) ───────────────────────────────

describe("db.js — syncShelfData", () => {
  it("returns early when no user", async () => {
    setupSupabase();
    await db.syncShelfData(null, "books", 2026, { months: [], bracket: {} });
    expect(calls).toHaveLength(0);
  });

  it("returns early when supabase is not configured", async () => {
    supabaseModule.__setMock(null);
    await db.syncShelfData("user-1", "books", 2026, { months: [], bracket: {} });
    // Nothing should crash
  });

  it("does no inserts for an empty shelf", async () => {
    const client = setupSupabase();
    client.from = vi.fn((table) => {
      const chain = supabaseModule.__makeChain(table);
      if (table === "seasons") {
        chain.single = vi.fn(() => Promise.resolve({ data: { id: "season-uuid-1" }, error: null }));
      }
      return chain;
    });

    const emptyData = {
      months: Array.from({ length: 12 }, () => ({ books: [], winner: null })),
      bracket: {},
    };

    await db.syncShelfData("user-1", "books", 2026, emptyData);

    // Should still issue the wipe-deletes for shelf_items, slot_champions, bracket_picks
    const deletes = calls.filter(c => c.op === "delete");
    const tables = new Set(deletes.map(c => c.table));
    expect(tables.has("shelf_items")).toBe(true);
    expect(tables.has("slot_champions")).toBe(true);
    expect(tables.has("bracket_picks")).toBe(true);

    // No inserts since there are no books
    const inserts = calls.filter(c => c.op === "insert");
    expect(inserts).toHaveLength(0);
  });
});
