/**
 * AuthContext.jsx — Supabase auth state for the whole app.
 *
 * Provides:
 *   useAuth()  → { user, session, loading, signIn, signUp, signOut, signInWithGoogle }
 *
 * When Supabase is not configured (no env vars) everything is a no-op and
 * `user` is always null — the app continues to work in local-only mode.
 */

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "./supabase.js";
import { track, EVENT } from "./events.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [session, setSession] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(!!supabase); // skip loading when no client

  // Look up the profile.is_admin flag whenever the user changes.
  // RLS guarantees this can only return true for the user's own row.
  const refreshAdmin = async (userId) => {
    if (!supabase || !userId) { setIsAdmin(false); return; }
    const { data } = await supabase
      .from("profiles").select("is_admin").eq("id", userId).maybeSingle();
    setIsAdmin(!!data?.is_admin);
  };

  useEffect(() => {
    if (!supabase) return;

    // Hydrate from existing session on mount
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      refreshAdmin(data.session?.user?.id);
      setLoading(false);
    });

    // Keep in sync with Supabase auth events (sign in, sign out, token refresh).
    // Also persist any pending marketing consent that was checked before the
    // user actually existed (email confirm flow, OAuth redirect).
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      refreshAdmin(s?.user?.id);

      if (event === "SIGNED_IN" && s?.user) {
        track(s.user.id, EVENT.SIGN_IN);

        const pending = localStorage.getItem("pending_marketing_consent");
        if (pending === "1") {
          await supabase.from("profiles").update({
            marketing_consent: true,
            consented_at:      new Date().toISOString(),
          }).eq("id", s.user.id);
          localStorage.removeItem("pending_marketing_consent");
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = useCallback(async ({ email, password, displayName, marketingConsent }) => {
    if (!supabase) return { error: new Error("Supabase not configured") };
    if (marketingConsent) localStorage.setItem("pending_marketing_consent", "1");
    return supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    });
  }, []);

  const signIn = useCallback(async ({ email, password }) => {
    if (!supabase) return { error: new Error("Supabase not configured") };
    return supabase.auth.signInWithPassword({ email, password });
  }, []);

  const signInWithGoogle = useCallback(async ({ marketingConsent } = {}) => {
    if (!supabase) return { error: new Error("Supabase not configured") };
    if (marketingConsent) localStorage.setItem("pending_marketing_consent", "1");
    return supabase.auth.signInWithOAuth({
      provider: "google",
      // Redirect directly to /books — going to "/" would trigger react-router's
      // <Navigate to="/books"> which strips the ?code=… query before Supabase
      // can exchange it for a session.
      options: { redirectTo: window.location.origin + "/books" },
    });
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, loading, isAdmin, signIn, signUp, signOut, signInWithGoogle }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
