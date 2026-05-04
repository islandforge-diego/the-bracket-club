/**
 * CategoryRouter — top-level route table for the app.
 *
 * Each category (books, movies, games, …) lives at its own path segment.
 * Adding a new category means:
 *   1. Create src/categories/<name>/ with data.js, share.js, etc.
 *   2. Add its config to src/shared/categoryConfig.js
 *   3. Import its page component below and add a <Route> entry.
 *
 * The catch-all redirect to /books keeps existing links working while
 * the landing page is under construction.
 */

import { useState } from "react";
import { Routes, Route, Navigate, Link, useLocation } from "react-router-dom";

// Like <Navigate to={to}> but preserves the current ?search and #hash so
// that OAuth callbacks (?code=…) and other query params survive the redirect.
function NavigateWithQuery({ to }) {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: to, search, hash }} replace />;
}
import BooksApp from "./App.jsx";
import { useAuth } from "./lib/AuthContext.jsx";
import LoginModal from "./lib/LoginModal.jsx";
import AdminPage from "./lib/AdminPage.jsx";
import { isMuted, setMuted, playUI } from "./shared/soundscape.js";

// Future category imports go here, e.g.:
// import MoviesApp from "./pages/movies/MoviesApp.jsx";

// Tiny sound-on/off chip floating top-left.  Visible to everyone (signed-in
// or not) so anyone can silence the musical UI feedback.  Persists to
// localStorage via setMuted() so the choice survives reload.
function SoundToggle() {
  const [m, setM] = useState(isMuted);
  const isDesktop = typeof window !== 'undefined' && window.innerWidth > 768;
  return (
    <button
      onClick={() => {
        const next = !m;
        setMuted(next);
        setM(next);
        if (!next) playUI("select");                  // confirmation chime when unmuting
      }}
      title={m ? "Sound off" : "Sound on"}
      style={{
        position: "fixed", top: 14, left: 16, zIndex: 200,
        background: isDesktop ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.92)",
        color: isDesktop ? "#fff" : "#1c1917",
        border: isDesktop ? "1px solid rgba(255,255,255,0.3)" : "1px solid #e5e7eb",
        borderRadius: 99, width: 32, height: 32, fontSize: 14,
        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      {m ? "🔇" : "🔊"}
    </button>
  );
}

function AccountButton() {
  const { user, loading, signOut, isAdmin } = useAuth();
  const [showLogin, setShowLogin]  = useState(false);
  const [showMenu,  setShowMenu]   = useState(false);
  const isDesktop = typeof window !== 'undefined' && window.innerWidth > 768;

  if (loading) return null;

  if (!user) return (
    <>
      <button
        onClick={() => setShowLogin(true)}
        style={{
          position: "fixed", top: 14, right: 16, zIndex: 200,
          background: isDesktop ? "rgba(255,255,255,0.18)" : "#1e293b",
          color: "#fff", border: isDesktop ? "1px solid rgba(255,255,255,0.3)" : "none",
          borderRadius: 20, padding: "6px 14px", fontSize: 13,
          fontWeight: 600, cursor: "pointer",
        }}
      >
        Sign in
      </button>
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
    </>
  );

  const initials = (user.user_metadata?.display_name || user.email || "?")
    .split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <>
      <button
        onClick={() => setShowMenu(v => !v)}
        style={{
          position: "fixed", top: 14, right: 16, zIndex: 200,
          width: 36, height: 36, borderRadius: "50%",
          background: "#6366f1", color: "#fff", border: "none",
          fontSize: 13, fontWeight: 700, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {initials}
      </button>
      {showMenu && (
        <div
          style={{
            position: "fixed", top: 56, right: 16, zIndex: 200,
            background: "#fff", borderRadius: 12, boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
            padding: "8px 0", minWidth: 160,
          }}
        >
          <div style={{ padding: "8px 16px", fontSize: 13, color: "#64748b", borderBottom: "1px solid #f1f5f9" }}>
            {user.user_metadata?.display_name || user.email}
          </div>
          {isAdmin && (
            <Link
              to="/admin"
              onClick={() => setShowMenu(false)}
              style={{
                display: "block", padding: "10px 16px",
                fontSize: 14, color: "#6366f1", textDecoration: "none",
                fontWeight: 600, borderBottom: "1px solid #f1f5f9",
              }}
            >
              Admin dashboard
            </Link>
          )}
          <button
            onClick={() => { signOut(); setShowMenu(false); }}
            style={{
              display: "block", width: "100%", textAlign: "left",
              padding: "10px 16px", background: "none", border: "none",
              cursor: "pointer", fontSize: 14, color: "#ef4444",
            }}
          >
            Sign out
          </button>
        </div>
      )}
      {showMenu && (
        <div
          onClick={() => setShowMenu(false)}
          style={{ position: "fixed", inset: 0, zIndex: 199 }}
        />
      )}
    </>
  );
}

export default function CategoryRouter() {
  return (
    <>
    <SoundToggle />
    <AccountButton />
    <Routes>
      {/* Redirect bare root to the books category for now */}
      <Route path="/" element={<NavigateWithQuery to="/books" />} />

      {/* Books category — the current app */}
      <Route path="/books/*" element={<BooksApp />} />

      {/* Admin dashboard (server-side guarded by is_admin() RLS) */}
      <Route path="/admin" element={<AdminPage />} />

      {/* Future categories:
          <Route path="/movies/*" element={<MoviesApp />} />
          <Route path="/games/*"  element={<GamesApp />}  />
      */}

      {/* Fallback for any unknown path */}
      <Route path="*" element={<NavigateWithQuery to="/books" />} />
    </Routes>
    </>
  );
}
