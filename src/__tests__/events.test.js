/**
 * events.test.js
 *
 * Tests for the fire-and-forget event tracker.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const inserts = [];
let supabaseMock;

vi.mock("../lib/supabase.js", () => ({
  get supabase() { return supabaseMock; },
  __setMock: (m) => { supabaseMock = m; },
}));

import { track, EVENT } from "../lib/events.js";
import * as supabaseModule from "../lib/supabase.js";

function mockSupabase({ error = null } = {}) {
  const client = {
    from: vi.fn(() => ({
      insert: vi.fn((row) => {
        inserts.push(row);
        return { then: (resolve) => resolve({ error }) };
      }),
    })),
  };
  supabaseModule.__setMock(client);
  return client;
}

beforeEach(() => {
  inserts.length = 0;
});

afterEach(() => {
  supabaseModule.__setMock(null);
});

describe("EVENT constants", () => {
  it("exposes the canonical event-type strings", () => {
    expect(EVENT.SIGN_IN).toBe("sign_in");
    expect(EVENT.BOOK_ADDED).toBe("book_added");
    expect(EVENT.BOOK_REMOVED).toBe("book_removed");
    expect(EVENT.WINNER_CROWNED).toBe("winner_crowned");
    expect(EVENT.BRACKET_PICK).toBe("bracket_pick");
    expect(EVENT.SEASON_CHAMPION).toBe("season_champion");
  });
});

describe("track() — graceful no-ops", () => {
  it("does nothing when supabase is null", () => {
    supabaseModule.__setMock(null);
    expect(() => track("user-1", EVENT.SIGN_IN)).not.toThrow();
    expect(inserts).toHaveLength(0);
  });

  it("does nothing when userId is missing", () => {
    mockSupabase();
    track(null, EVENT.SIGN_IN);
    track(undefined, EVENT.SIGN_IN);
    track("",   EVENT.SIGN_IN);
    expect(inserts).toHaveLength(0);
  });

  it("does nothing when eventType is missing", () => {
    mockSupabase();
    track("user-1", null);
    track("user-1", "");
    expect(inserts).toHaveLength(0);
  });
});

describe("track() — successful writes", () => {
  it("inserts a row with user_id, event_type, properties", () => {
    mockSupabase();
    track("user-1", EVENT.BOOK_ADDED, { slot: 3, source: "manual" });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toEqual({
      user_id: "user-1",
      event_type: "book_added",
      properties: { slot: 3, source: "manual" },
    });
  });

  it("defaults properties to an empty object when omitted", () => {
    mockSupabase();
    track("user-1", EVENT.SIGN_IN);
    expect(inserts[0].properties).toEqual({});
  });

  it("hits the events table specifically", () => {
    const client = mockSupabase();
    track("user-1", EVENT.SIGN_IN);
    expect(client.from).toHaveBeenCalledWith("events");
  });
});

describe("track() — error handling", () => {
  it("logs a warning but does not throw when Supabase returns an error", async () => {
    mockSupabase({ error: { message: "RLS denied" } });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(() => track("user-1", EVENT.SIGN_IN)).not.toThrow();
    // Wait for the .then() to fire
    await new Promise(r => setTimeout(r, 0));
    expect(warn).toHaveBeenCalled();
    expect(warn.mock.calls[0][0]).toMatch(/track\(sign_in\) failed/);

    warn.mockRestore();
  });
});
