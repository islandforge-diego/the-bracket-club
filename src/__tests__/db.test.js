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

});

// ─── ensureItem: catalog dedup + insert ──────────────────────────────────────

describe("db.js — ensureItem", () => {
  // Helper: install a Supabase mock where every chain returns "no existing row"
  // for maybeSingle (so all dedup checks miss) and a fake UUID for insert.single.
  const setupInsertMock = () => {
    const client = setupSupabase();
    client.from = vi.fn((table) => {
      const chain = supabaseModule.__makeChain(table);
      chain.single = vi.fn(() => Promise.resolve({ data: { id: "item-uuid" }, error: null }));
      chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
      return chain;
    });
    return client;
  };

  it("short-circuits and returns the id directly when book.id is a UUID", async () => {
    setupInsertMock();
    const id = await db.ensureItem({
      id: "11111111-2222-3333-4444-555555555555",
      title: "Already in catalog",
    }, "books");
    expect(id).toBe("11111111-2222-3333-4444-555555555555");
    // No DB calls at all
    expect(calls.find(c => c.table === "items")).toBeUndefined();
  });

  it("dedups by source/source_id when googleBooksId is present", async () => {
    const client = setupSupabase();
    client.from = vi.fn(() => {
      const chain = supabaseModule.__makeChain("items");
      // First call (the dedup lookup) returns an existing row
      chain.maybeSingle = vi.fn(() => Promise.resolve({ data: { id: "existing-uuid" }, error: null }));
      return chain;
    });
    const id = await db.ensureItem({
      title: "Project Hail Mary",
      author: "Andy Weir",
      googleBooksId: "abc123",
    }, "books");
    expect(id).toBe("existing-uuid");
    // No insert happened — we reused the catalog row
    expect(calls.find(c => c.op === "insert" && c.table === "items")).toBeUndefined();
  });

  it("inserts a new row with creators[], external_ids, and source when no match found", async () => {
    setupInsertMock();
    await db.ensureItem({
      title: "Some Indie Book",
      author: "Unknown Author",
      googleBooksId: "newId789",
      isbn13: "9781234567890",
    }, "books", "user-uuid-here");

    const insert = calls.find(c => c.op === "insert" && c.table === "items");
    expect(insert).toBeDefined();
    expect(insert.rows.creators).toEqual(["Unknown Author"]);
    expect(insert.rows.external_ids.google_books_id).toBe("newId789");
    expect(insert.rows.external_ids.isbn_13).toBe("9781234567890");
    expect(insert.rows.source).toBe("google_books");
    expect(insert.rows.source_id).toBe("newId789");
    expect(insert.rows.created_by_user_id).toBe("user-uuid-here");
    expect(insert.rows.is_verified).toBe(false);
  });

  it("preserves an existing creators[] array when present", async () => {
    setupInsertMock();
    await db.ensureItem({
      title: "Good Omens",
      creators: ["Neil Gaiman", "Terry Pratchett"],
    }, "books");
    const insert = calls.find(c => c.op === "insert" && c.table === "items");
    expect(insert.rows.creators).toEqual(["Neil Gaiman", "Terry Pratchett"]);
  });

  it("does not write data_sources when book is not _enriched", async () => {
    setupInsertMock();
    await db.ensureItem({ title: "X", author: "Y" }, "books");
    const insert = calls.find(c => c.op === "insert" && c.table === "items");
    expect(insert.rows.data_sources).toEqual({});
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
