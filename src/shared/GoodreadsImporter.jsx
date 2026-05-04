/**
 * GoodreadsImporter — fetch a user's Goodreads "read" shelf and let them
 * cherry-pick books into the current bracket.
 *
 * Flow:
 *   1. User pastes their Goodreads user ID or profile URL
 *   2. We fetch their "read" shelf RSS via the existing /api/goodreads
 *      proxy (handles CORS) and parse it client-side
 *   3. Books render as a multi-select grid, capped at the bracket's
 *      remaining capacity
 *   4. "Add N books" → calls onImport with the selected books
 *
 * The user's last Goodreads ID is cached in localStorage so they don't have
 * to re-enter it for every bracket.  No persistent credentials anywhere —
 * the RSS feed is public per Goodreads.
 *
 * Props
 *   maxToAdd  number of slots remaining in the bracket
 *   onImport  (books) => void — receives selected books in the same shape
 *             addBook expects ({ title, author, cover, rating?, description? })
 *   onClose   () => void
 */

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Cover from "./Cover.jsx";
import { extractGoodreadsUserId, fetchAllGoodreadsBooks } from "../categories/books/data.js";

const STORAGE_KEY = "bc_goodreads_user_id";

export default function GoodreadsImporter({ maxToAdd, onImport, onClose }) {
  const [input,    setInput]    = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) || ""; } catch { return ""; }
  });
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [books,    setBooks]    = useState([]);
  const [selected, setSelected] = useState(new Set());
  const inputRef = useRef(null);

  // Auto-fetch on mount if we already have a saved ID — saves a tap
  useEffect(() => {
    if (input && !books.length && !loading) {
      const uid = extractGoodreadsUserId(input);
      if (uid) doFetch(uid);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doFetch = async (uidArg) => {
    const uid = uidArg || extractGoodreadsUserId(input);
    if (!uid) {
      setError("Couldn't find a user ID in that.  Paste your full Goodreads profile URL — the link from the address bar of your profile page.");
      return;
    }
    setLoading(true);
    setError("");
    setSelected(new Set());
    try {
      const items = await fetchAllGoodreadsBooks(uid);
      // Sort newest-read first so users see recent reads at the top
      const sorted = items.sort((a, b) => (b.year - a.year) || (b.month - a.month));
      setBooks(sorted);
      try { localStorage.setItem(STORAGE_KEY, uid); } catch { /* ignore */ }
      if (sorted.length === 0) setError("No books found on that user's read shelf.");
    } catch (e) {
      setError("Couldn't reach Goodreads.  The shelf may be private, or the proxy is offline.");
    }
    setLoading(false);
  };

  const toggle = (i) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(i))         next.delete(i);
      else if (next.size < maxToAdd) next.add(i);
      return next;
    });
  };

  const doImport = () => {
    const picked = [...selected].map((i) => books[i]);
    onImport?.(picked);
  };

  const overlay = (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1300,
        background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "stretch", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#f0fdf4", width: "100%", maxWidth: 480,
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        {/* ── Header ────────────────────────────────────────────── */}
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #e7e5e4", background: "#fff", display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#15803d", fontWeight: 700, fontSize: 13, cursor: "pointer", padding: 0 }}>
            ✕ Close
          </button>
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: "#1c1917" }}>Import from Goodreads</div>
            <div style={{ fontSize: 10, color: "#9ca3af" }}>Pick books from your read shelf</div>
          </div>
          <div style={{ width: 50 }} />
        </div>

        {/* ── Body: input + grid ───────────────────────────────── */}
        <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Input row */}
          <div>
            <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1, fontWeight: 800, marginBottom: 6 }}>
              Paste a Goodreads profile link
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="https://goodreads.com/user/show/…"
                style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: "1.5px solid #e2e8f0", fontSize: 13, outline: "none", boxSizing: "border-box", background: "#fff" }}
              />
              <button
                onClick={() => doFetch()}
                disabled={loading || !input.trim()}
                style={{ padding: "10px 14px", borderRadius: 10, background: loading || !input.trim() ? "#d6d3d1" : "#14532d", color: "#fff", border: "none", fontWeight: 800, fontSize: 13, cursor: loading || !input.trim() ? "default" : "pointer" }}
              >
                {loading ? "…" : "Fetch"}
              </button>
            </div>

            {/* How-to: 3 quick steps */}
            <div style={{ marginTop: 10, padding: "10px 12px", background: "#f0fdf4", borderRadius: 10, border: "1px solid #dcfce7" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#15803d", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                How to grab the link
              </div>
              <div style={{ fontSize: 12, color: "#166534", lineHeight: 1.55 }}>
                <div>1. Open <strong>your Goodreads profile</strong> (yours or anyone's — the read shelf must be public)</div>
                <div style={{ marginTop: 3 }}>2. Tap the <strong>Share</strong> button → <strong>Copy Link</strong></div>
                <div style={{ marginTop: 3 }}>3. Paste it above and tap Fetch</div>
              </div>
            </div>
          </div>

          {error && (
            <div style={{ padding: "10px 12px", background: "#fef2f2", color: "#991b1b", borderRadius: 10, fontSize: 12 }}>
              {error}
            </div>
          )}

          {books.length > 0 && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 4 }}>
                <div style={{ fontSize: 12, color: "#78716c", fontWeight: 700 }}>
                  {books.length} books on your shelf
                </div>
                <div style={{ fontSize: 12, color: selected.size > 0 ? "#15803d" : "#9ca3af", fontWeight: 700 }}>
                  {selected.size} / {maxToAdd} selected
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {books.map((b, i) => {
                  const sel = selected.has(i);
                  const disabled = !sel && selected.size >= maxToAdd;
                  return (
                    <button key={i} onClick={() => toggle(i)} disabled={disabled}
                      style={{
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                        padding: 6, background: sel ? "#f0fdf4" : "#fff",
                        border: `2px solid ${sel ? "#22c55e" : "#e7e5e4"}`,
                        borderRadius: 10, cursor: disabled ? "default" : "pointer",
                        opacity: disabled ? 0.45 : 1, position: "relative", textAlign: "center",
                        transition: "all .15s",
                      }}>
                      <Cover book={b} size="sm" />
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#1c1917", lineHeight: 1.2, maxHeight: 24, overflow: "hidden" }}>
                        {b.title}
                      </div>
                      {b.rating ? (
                        <div style={{ fontSize: 9, color: "#f59e0b", letterSpacing: 0.5 }}>
                          {"★".repeat(b.rating)}
                        </div>
                      ) : null}
                      {sel && (
                        <span style={{ position: "absolute", top: 3, right: 3, background: "#22c55e", color: "#fff", borderRadius: 99, width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800 }}>
                          ✓
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {!loading && !error && books.length === 0 && (
            <div style={{ background: "#fff", borderRadius: 12, padding: "20px 16px", textAlign: "center", color: "#9ca3af", fontSize: 12 }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>📚</div>
              Enter your Goodreads ID above and tap Fetch.
            </div>
          )}
        </div>

        {/* ── Footer: import CTA ───────────────────────────────── */}
        <div style={{ borderTop: "1px solid #e7e5e4", background: "#fff", padding: "12px 14px" }}>
          <button onClick={doImport} disabled={selected.size === 0}
            style={{ width: "100%", padding: 13, borderRadius: 10, background: selected.size === 0 ? "#d6d3d1" : "#14532d", color: "#fff", border: "none", fontWeight: 800, fontSize: 14, cursor: selected.size === 0 ? "default" : "pointer" }}>
            {selected.size === 0 ? "Pick at least one book" : `Add ${selected.size} ${selected.size === 1 ? "book" : "books"} to bracket`}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
