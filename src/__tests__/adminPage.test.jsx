/**
 * adminPage.test.jsx
 *
 * Tests for the admin dashboard. The auth state and db functions are mocked
 * so we can verify the access guard, loading state, and table rendering
 * without hitting Supabase.
 *
 * Note: server-side access is also enforced by RLS — these tests cover the
 * UI guard, not the security boundary itself.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

let mockAuth = { user: null, isAdmin: false, loading: false };
const loadAdminUserSummary  = vi.fn(() => Promise.resolve([]));
const loadAdminPlatformStats = vi.fn(() => Promise.resolve(null));

vi.mock("../lib/AuthContext.jsx", () => ({
  useAuth: () => mockAuth,
}));

vi.mock("../lib/db.js", () => ({
  loadAdminUserSummary:   (...args) => loadAdminUserSummary(...args),
  loadAdminPlatformStats: (...args) => loadAdminPlatformStats(...args),
  // Stubs for the AdminBookSearch section so AdminPage mounts cleanly.
  getNewReleases:         () => Promise.resolve([]),
  upsertVerifiedItem:     () => Promise.resolve(null),
  removeVerifiedItem:     () => Promise.resolve(),
}));

import AdminPage from "../lib/AdminPage.jsx";

const wrap = (el) => <MemoryRouter>{el}</MemoryRouter>;

beforeEach(() => {
  loadAdminUserSummary.mockClear();
  loadAdminPlatformStats.mockClear();
});

afterEach(() => cleanup());

// ─── Access guards ───────────────────────────────────────────────────────────

describe("AdminPage — access guards", () => {
  it("shows 'Sign in required' when no user", () => {
    mockAuth = { user: null, isAdmin: false, loading: false };
    render(wrap(<AdminPage />));
    expect(screen.getByText(/sign in required/i)).toBeDefined();
    // Should NOT have called the admin queries
    expect(loadAdminUserSummary).not.toHaveBeenCalled();
    expect(loadAdminPlatformStats).not.toHaveBeenCalled();
  });

  it("shows 'Not authorized' when signed in but not admin", () => {
    mockAuth = { user: { id: "u1", email: "x@y.com" }, isAdmin: false, loading: false };
    render(wrap(<AdminPage />));
    expect(screen.getByText(/not authorized/i)).toBeDefined();
    expect(loadAdminUserSummary).not.toHaveBeenCalled();
  });

  it("renders nothing while auth is loading", () => {
    mockAuth = { user: null, isAdmin: false, loading: true };
    const { container } = render(wrap(<AdminPage />));
    expect(container.textContent).toBe("");
  });
});

// ─── Admin dashboard rendering ───────────────────────────────────────────────

describe("AdminPage — admin view", () => {
  beforeEach(() => {
    mockAuth = {
      user: { id: "admin-1", email: "diego@islandforge.studio" },
      isAdmin: true,
      loading: false,
    };
  });

  it("calls both admin queries on mount", async () => {
    render(wrap(<AdminPage />));
    await waitFor(() => {
      expect(loadAdminUserSummary).toHaveBeenCalledOnce();
      expect(loadAdminPlatformStats).toHaveBeenCalledOnce();
    });
  });

  it("renders the platform stats", async () => {
    loadAdminPlatformStats.mockResolvedValueOnce({
      total_users: 42,
      marketing_opt_ins: 30,
      active_30d: 25,
      new_signups_7d: 5,
      total_shelf_items: 320,
      total_bracket_picks: 180,
      total_season_champions: 10,
    });
    render(wrap(<AdminPage />));

    expect(await screen.findByText("42")).toBeDefined();   // total users
    expect(screen.getByText("30")).toBeDefined();          // marketing opt-ins
    expect(screen.getByText("25")).toBeDefined();          // active 30d
    expect(screen.getByText("320")).toBeDefined();         // shelf items
    expect(screen.getByText("180")).toBeDefined();         // bracket picks
    expect(screen.getByText(/71% of users/)).toBeDefined(); // 30/42 ≈ 71%
    expect(screen.getByText(/5 new in last 7 days/)).toBeDefined();
  });

  it("renders the user table with admin badge for admin users", async () => {
    loadAdminUserSummary.mockResolvedValueOnce([
      {
        id: "u1", email: "alice@ex.com", display_name: "Alice",
        marketing_consent: true,  consented_at: "2026-04-01T00:00:00Z",
        is_admin: false,
        signed_up_at: "2026-04-01T00:00:00Z",
        last_sign_in_at: new Date().toISOString(),
        shelf_count: 12, pick_count: 8, season_champ_count: 1,
      },
      {
        id: "u2", email: "diego@islandforge.studio", display_name: "Diego",
        marketing_consent: false, consented_at: null,
        is_admin: true,
        signed_up_at: "2026-03-01T00:00:00Z",
        last_sign_in_at: new Date().toISOString(),
        shelf_count: 24, pick_count: 16, season_champ_count: 2,
      },
    ]);

    render(wrap(<AdminPage />));

    expect(await screen.findByText("alice@ex.com")).toBeDefined();
    // "diego@islandforge.studio" appears twice (header + row) — getAllByText
    expect(screen.getAllByText(/diego@islandforge\.studio/)).toHaveLength(2);
    expect(screen.getByText("Alice")).toBeDefined();
    expect(screen.getByText("Diego")).toBeDefined();
    expect(screen.getByText("ADMIN")).toBeDefined();
    expect(screen.getByText("(2)")).toBeDefined(); // user count in header
  });

  it("shows 'No users yet.' when the user list is empty", async () => {
    loadAdminUserSummary.mockResolvedValueOnce([]);
    loadAdminPlatformStats.mockResolvedValueOnce({ total_users: 0 });
    render(wrap(<AdminPage />));
    expect(await screen.findByText(/no users yet/i)).toBeDefined();
  });

  it("includes the signed-in admin's email in the header", async () => {
    render(wrap(<AdminPage />));
    expect(screen.getByText(/diego@islandforge\.studio/)).toBeDefined();
  });
});
