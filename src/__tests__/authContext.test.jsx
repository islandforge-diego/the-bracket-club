/**
 * authContext.test.jsx
 *
 * Tests for the AuthContext provider + useAuth() hook. The Supabase client
 * is mocked so we can drive auth events synchronously and verify what gets
 * called for sign in / up / out and the marketing-consent persistence flow.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, cleanup, renderHook } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ─── Mock the supabase client ────────────────────────────────────────────────

let supabaseMock;
const profileUpdates = []; // captures every profiles.update({...}) call

vi.mock("../lib/supabase.js", () => ({
  get supabase() { return supabaseMock; },
  __setMock: (m) => { supabaseMock = m; },
}));

import { AuthProvider, useAuth } from "../lib/AuthContext.jsx";
import * as supabaseModule from "../lib/supabase.js";

// Builds a fresh mock client. Returns helpers to fire auth events and inspect calls.
function mockSupabase() {
  let authStateCallback = null;
  const calls = { signUp: [], signIn: [], oauth: [], signOut: 0 };

  const client = {
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
      onAuthStateChange: vi.fn((cb) => {
        authStateCallback = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      signUp: vi.fn((args) => {
        calls.signUp.push(args);
        return Promise.resolve({ data: { user: null }, error: null });
      }),
      signInWithPassword: vi.fn((args) => {
        calls.signIn.push(args);
        return Promise.resolve({ data: { user: null }, error: null });
      }),
      signInWithOAuth: vi.fn((args) => {
        calls.oauth.push(args);
        return Promise.resolve({ data: {}, error: null });
      }),
      signOut: vi.fn(() => {
        calls.signOut++;
        return Promise.resolve({ error: null });
      }),
    },
    from: vi.fn((table) => {
      const chain = {
        update: vi.fn((data) => {
          profileUpdates.push({ table, data });
          return chain;
        }),
        eq: vi.fn(() => chain),
        then: (resolve) => resolve({ error: null }),
      };
      return chain;
    }),
  };

  supabaseModule.__setMock(client);
  return {
    client,
    calls,
    fireSignedIn: (user) => authStateCallback?.("SIGNED_IN", { user }),
    fireSignedOut: () => authStateCallback?.("SIGNED_OUT", null),
  };
}

// Tiny harness that exposes the auth hook via a callback
function HookProbe({ onReady }) {
  const auth = useAuth();
  onReady(auth);
  return null;
}

beforeEach(() => {
  localStorage.clear();
  profileUpdates.length = 0;
});

afterEach(() => {
  cleanup();
  supabaseModule.__setMock(null);
});

// ─── Provider behavior without supabase ──────────────────────────────────────

describe("AuthProvider — no supabase configured", () => {
  it("renders with user=null and loading=false", () => {
    supabaseModule.__setMock(null);
    let auth;
    render(
      <AuthProvider>
        <HookProbe onReady={(a) => { auth = a; }} />
      </AuthProvider>
    );
    expect(auth.user).toBeNull();
    expect(auth.loading).toBe(false);
  });

  it("signUp returns an error when supabase is missing", async () => {
    supabaseModule.__setMock(null);
    let auth;
    render(<AuthProvider><HookProbe onReady={(a) => { auth = a; }} /></AuthProvider>);
    const { error } = await auth.signUp({ email: "x@y.com", password: "abc" });
    expect(error).toBeInstanceOf(Error);
  });
});

// ─── Sign-up + consent persistence ───────────────────────────────────────────

describe("AuthProvider — sign-up flow with marketing consent", () => {
  it("stores pending_marketing_consent in localStorage when consent=true", async () => {
    const { calls } = mockSupabase();
    let auth;
    render(<AuthProvider><HookProbe onReady={(a) => { auth = a; }} /></AuthProvider>);

    await act(async () => {
      await auth.signUp({ email: "x@y.com", password: "abc12345", displayName: "X", marketingConsent: true });
    });

    expect(localStorage.getItem("pending_marketing_consent")).toBe("1");
    expect(calls.signUp[0].email).toBe("x@y.com");
    expect(calls.signUp[0].options.data.display_name).toBe("X");
  });

  it("does NOT store pending consent when consent=false", async () => {
    mockSupabase();
    let auth;
    render(<AuthProvider><HookProbe onReady={(a) => { auth = a; }} /></AuthProvider>);

    await act(async () => {
      await auth.signUp({ email: "x@y.com", password: "abc12345", marketingConsent: false });
    });

    expect(localStorage.getItem("pending_marketing_consent")).toBeNull();
  });

  it("writes profile.marketing_consent on the SIGNED_IN event when pending flag is set", async () => {
    const harness = mockSupabase();
    let auth;
    render(<AuthProvider><HookProbe onReady={(a) => { auth = a; }} /></AuthProvider>);

    // Simulate user signing up with consent
    await act(async () => {
      await auth.signUp({ email: "x@y.com", password: "abc12345", marketingConsent: true });
    });

    expect(localStorage.getItem("pending_marketing_consent")).toBe("1");

    // Simulate confirming the email and signing in
    await act(async () => {
      await harness.fireSignedIn({ id: "user-uuid-1" });
    });

    // The profiles row should have been updated
    expect(profileUpdates).toHaveLength(1);
    expect(profileUpdates[0].table).toBe("profiles");
    expect(profileUpdates[0].data.marketing_consent).toBe(true);
    expect(profileUpdates[0].data.consented_at).toBeDefined();

    // The pending flag should have been cleared
    expect(localStorage.getItem("pending_marketing_consent")).toBeNull();
  });

  it("does NOT update profile when SIGNED_IN fires without a pending flag", async () => {
    const harness = mockSupabase();
    render(<AuthProvider><HookProbe onReady={() => {}} /></AuthProvider>);

    await act(async () => {
      await harness.fireSignedIn({ id: "user-uuid-2" });
    });

    expect(profileUpdates).toHaveLength(0);
  });
});

// ─── Sign-in flow ────────────────────────────────────────────────────────────

describe("AuthProvider — sign-in flow", () => {
  it("calls supabase.auth.signInWithPassword", async () => {
    const { calls } = mockSupabase();
    let auth;
    render(<AuthProvider><HookProbe onReady={(a) => { auth = a; }} /></AuthProvider>);

    await act(async () => {
      await auth.signIn({ email: "x@y.com", password: "abc" });
    });

    expect(calls.signIn).toHaveLength(1);
    expect(calls.signIn[0]).toEqual({ email: "x@y.com", password: "abc" });
  });
});

// ─── Google OAuth ────────────────────────────────────────────────────────────

describe("AuthProvider — Google OAuth", () => {
  it("stores pending consent before redirect when marketingConsent=true", async () => {
    const { calls } = mockSupabase();
    let auth;
    render(<AuthProvider><HookProbe onReady={(a) => { auth = a; }} /></AuthProvider>);

    await act(async () => {
      await auth.signInWithGoogle({ marketingConsent: true });
    });

    expect(localStorage.getItem("pending_marketing_consent")).toBe("1");
    expect(calls.oauth[0].provider).toBe("google");
  });

  it("does not set pending consent when marketingConsent=false", async () => {
    mockSupabase();
    let auth;
    render(<AuthProvider><HookProbe onReady={(a) => { auth = a; }} /></AuthProvider>);

    await act(async () => {
      await auth.signInWithGoogle({ marketingConsent: false });
    });

    expect(localStorage.getItem("pending_marketing_consent")).toBeNull();
  });
});

// ─── Sign-out ────────────────────────────────────────────────────────────────

describe("AuthProvider — sign-out", () => {
  it("calls supabase.auth.signOut", async () => {
    const { calls } = mockSupabase();
    let auth;
    render(<AuthProvider><HookProbe onReady={(a) => { auth = a; }} /></AuthProvider>);

    await act(async () => {
      await auth.signOut();
    });

    expect(calls.signOut).toBe(1);
  });
});

// ─── useAuth must be inside provider ─────────────────────────────────────────

describe("useAuth — usage outside provider", () => {
  it("throws a clear error when called without an AuthProvider", () => {
    expect(() => renderHook(() => useAuth())).toThrow(/AuthProvider/);
  });
});
