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
import { Routes, Route, Navigate, Link } from "react-router-dom";
import BooksApp from "./App.jsx";
import { useAuth } from "./lib/AuthContext.jsx";
import LoginModal from "./lib/LoginModal.jsx";
import AdminPage from "./lib/AdminPage.jsx";

// Future category imports go here, e.g.:
// import MoviesApp from "./pages/movies/MoviesApp.jsx";

function AccountButton() {
  const { user, loading, signOut, isAdmin } = useAuth();
  const [showLogin, setShowLogin]  = useState(false);
  const [showMenu,  setShowMenu]   = useState(false);

  if (loading) return null;

  if (!user) return (
    <>
      <button
        onClick={() => setShowLogin(true)}
        style={{
          position: "fixed", top: 14, right: 16, zIndex: 200,
          background: "#1e293b", color: "#fff", border: "none",
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
    <AccountButton />
    <Routes>
      {/* Redirect bare root to the books category for now */}
      <Route path="/" element={<Navigate to="/books" replace />} />

      {/* Books category — the current app */}
      <Route path="/books/*" element={<BooksApp />} />

      {/* Admin dashboard (server-side guarded by is_admin() RLS) */}
      <Route path="/admin" element={<AdminPage />} />

      {/* Future categories:
          <Route path="/movies/*" element={<MoviesApp />} />
          <Route path="/games/*"  element={<GamesApp />}  />
      */}

      {/* Fallback for any unknown path */}
      <Route path="*" element={<Navigate to="/books" replace />} />
    </Routes>
    </>
  );
}
