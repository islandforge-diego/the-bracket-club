/**
 * CSVImporter — pull a library export CSV (Goodreads or StoryGraph) into
 * the active library / bracket.
 *
 * Both platforms export their library as a CSV with the same essential
 * shape: title, author, rating, date read, status.  parseLibraryCSV picks
 * the columns by name pattern so the user doesn't have to declare which
 * service they're importing from.
 *
 * Same multi-select + filter + import-all pattern as GoodreadsImporter so
 * users get a consistent flow regardless of source.
 *
 * Props
 *   maxToAdd            slots remaining
 *   onImport            (books) => void
 *   onClose             () => void
 *   destinationLabel    "library" | "bracket" — drives CTA copy
 */

import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import Cover from "./Cover.jsx";
import { parseLibraryCSV } from "../categories/books/data.js";

export default function CSVImporter({ maxToAdd, onImport, onClose, destinationLabel = "library" }) {
  const [books,    setBooks]    = useState([]);
  const [error,    setError]    = useState("");
  const [filename, setFilename] = useState("");
  const [selected, setSelected] = useState(new Set());

  const [filterText,   setFilterText]   = useState("");
  const [filterYear,   setFilterYear]   = useState("all");
  const [filterRating, setFilterRating] = useState(0);

  const fileRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    setError("");
    setSelected(new Set());
    setFilename(file.name);
    try {
      const text  = await file.text();
      const items = parseLibraryCSV(text);
      const sorted = items.sort((a, b) => (b.year || 0) - (a.year || 0) || (b.month || 0) - (a.month || 0));
      setBooks(sorted);
      if (sorted.length === 0) {
        setError("Couldn't find any read books in that CSV.  Make sure it's a Goodreads or StoryGraph library export.");
      }
    } catch {
      setError("Couldn't read that file.  Try exporting again from Goodreads (Settings → Import/Export) or StoryGraph.");
    }
  };

  const visible = books.filter((b) => {
    if (filterText.trim()) {
      const q = filterText.toLowerCase();
      if (!b.title?.toLowerCase().includes(q) && !b.author?.toLowerCase().includes(q)) return false;
    }
    if (filterYear !== "all" && b.year !== Number(filterYear)) return false;
    if (filterRating > 0 && (b.rating || 0) < filterRating) return false;
    return true;
  });
  const years = [...new Set(books.map((b) => b.year).filter(Boolean))].sort((a, b) => b - a);
  const visibleIdxs = visible.map((b) => books.indexOf(b));
  const allVisibleSelected = visibleIdxs.length > 0 && visibleIdxs.every((i) => selected.has(i));

  const toggle = (i) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(i))           next.delete(i);
      else if (next.size < maxToAdd) next.add(i);
      return next;
    });
  };
  const selectAllVisible = () => {
    setSelected((s) => {
      const next = new Set(s);
      for (const i of visibleIdxs) {
        if (next.size >= maxToAdd) break;
        next.add(i);
      }
      return next;
    });
  };
  const clearSelection = () => setSelected(new Set());

  const doImportSelected = () => {
    const picked = [...selected].map((i) => books[i]);
    onImport?.(picked);
  };

  const importAllVisible = () => {
    const cap = Math.min(visible.length, maxToAdd);
    if (cap < visible.length) {
      if (!confirm(`Only ${cap} of ${visible.length} books will fit.  Import the first ${cap}?`)) return;
    } else if (cap > 100) {
      if (!confirm(`Import all ${cap} books to your ${destinationLabel}?`)) return;
    }
    onImport?.(visible.slice(0, cap));
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
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #e7e5e4", background: "#fff", display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#15803d", fontWeight: 700, fontSize: 13, cursor: "pointer", padding: 0 }}>
            ✕ Close
          </button>
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: "#1c1917" }}>Import a CSV</div>
            <div style={{ fontSize: 10, color: "#9ca3af" }}>Goodreads or StoryGraph library export</div>
          </div>
          <div style={{ width: 50 }} />
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: "none" }}
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <button onClick={() => fileRef.current?.click()}
              style={{ width: "100%", padding: "16px", borderRadius: 12, background: "#fff", border: "1.5px dashed #14532d", color: "#14532d", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
              📄 {filename ? `Replace: ${filename}` : "Choose CSV file"}
            </button>

            {books.length === 0 && !error && (
              <div style={{ marginTop: 10, padding: "10px 12px", background: "#f0fdf4", borderRadius: 10, border: "1px solid #dcfce7" }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#15803d", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                  Where to get the file
                </div>
                <div style={{ fontSize: 12, color: "#166534", lineHeight: 1.55 }}>
                  <div><strong>Goodreads:</strong> goodreads.com/review/import → Export Library</div>
                  <div style={{ marginTop: 3 }}><strong>StoryGraph:</strong> Manage account → Manage Data → Export Library</div>
                </div>
              </div>
            )}
          </div>

          {error && (
            <div style={{ padding: "10px 12px", background: "#fef2f2", color: "#991b1b", borderRadius: 10, fontSize: 12 }}>
              {error}
            </div>
          )}

          {books.length > 0 && (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 12px", background: "#fff", borderRadius: 12, border: "1px solid #e7e5e4" }}>
                <input
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  placeholder="Filter by title or author…"
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #e7e5e4", fontSize: 13, outline: "none", boxSizing: "border-box" }}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)}
                    style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #e7e5e4", fontSize: 12, background: "#fff" }}>
                    <option value="all">All years</option>
                    {years.map((y) => <option key={y} value={String(y)}>Read in {y}</option>)}
                  </select>
                  <select value={filterRating} onChange={(e) => setFilterRating(Number(e.target.value))}
                    style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #e7e5e4", fontSize: 12, background: "#fff" }}>
                    <option value="0">Any rating</option>
                    <option value="3">★★★ &amp; up</option>
                    <option value="4">★★★★ &amp; up</option>
                    <option value="5">★★★★★ only</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 12, color: "#78716c", fontWeight: 700 }}>
                  {visible.length} of {books.length} shown
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={allVisibleSelected ? clearSelection : selectAllVisible}
                    style={{ padding: "5px 10px", borderRadius: 99, background: "#fff", border: "1px solid #e7e5e4", fontSize: 11, fontWeight: 700, color: "#15803d", cursor: "pointer" }}>
                    {allVisibleSelected ? "Clear" : "Select all"}
                  </button>
                  <span style={{ fontSize: 12, color: selected.size > 0 ? "#15803d" : "#9ca3af", fontWeight: 700, alignSelf: "center" }}>
                    {selected.size} / {maxToAdd}
                  </span>
                </div>
              </div>

              {visible.length === 0 ? (
                <div style={{ padding: "20px 16px", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
                  No books match these filters.
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                  {visible.map((b) => {
                    const i = books.indexOf(b);
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
                        {b.rating ? <div style={{ fontSize: 9, color: "#f59e0b", letterSpacing: 0.5 }}>{"★".repeat(b.rating)}</div> : null}
                        {sel && (
                          <span style={{ position: "absolute", top: 3, right: 3, background: "#22c55e", color: "#fff", borderRadius: 99, width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800 }}>✓</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {books.length > 0 && (
          <div style={{ borderTop: "1px solid #e7e5e4", background: "#fff", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
            <button onClick={importAllVisible} disabled={visible.length === 0}
              style={{ width: "100%", padding: 12, borderRadius: 10, background: visible.length === 0 ? "#d6d3d1" : "#fbbf24", color: "#14532d", border: "none", fontWeight: 800, fontSize: 13, cursor: visible.length === 0 ? "default" : "pointer" }}>
              ⚡ Import all {visible.length === books.length ? books.length : `${visible.length} matching`} {visible.length === 1 ? "book" : "books"}
            </button>
            <button onClick={doImportSelected} disabled={selected.size === 0}
              style={{ width: "100%", padding: 12, borderRadius: 10, background: selected.size === 0 ? "#d6d3d1" : "#14532d", color: "#fff", border: "none", fontWeight: 800, fontSize: 13, cursor: selected.size === 0 ? "default" : "pointer" }}>
              {selected.size === 0 ? "Pick books to add manually" : `Add ${selected.size} selected to ${destinationLabel}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
