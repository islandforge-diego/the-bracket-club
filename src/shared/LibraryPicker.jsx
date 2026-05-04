/**
 * LibraryPicker — multi-select modal that pulls from the user's shelves
 * into the active bracket.
 *
 * Aggregates books across every shelf (deduplicated by fingerprint).  An
 * extra `_shelfName` field on each row surfaces which shelf each book
 * lives in, so the user can spot duplicates by context.
 *
 * Props
 *   maxToAdd  number of slots remaining in the bracket
 *   onImport  (books) => void — receives selected books
 *   onClose   () => void
 */

import { useState } from "react";
import { createPortal } from "react-dom";
import Cover from "./Cover.jsx";
import { listAllBooks } from "./userShelves.js";

export default function LibraryPicker({ maxToAdd, onImport, onClose }) {
  const books = listAllBooks();
  const [selected, setSelected] = useState(new Set());
  const [filter,   setFilter]   = useState("");

  const filtered = filter.trim()
    ? books.filter((b) => {
        const q = filter.toLowerCase();
        return b.title?.toLowerCase().includes(q) || b.author?.toLowerCase().includes(q);
      })
    : books;

  const toggle = (id) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id))           next.delete(id);
      else if (next.size < maxToAdd) next.add(id);
      return next;
    });
  };

  const doImport = () => {
    const picked = books.filter((b) => selected.has(b.id));
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
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #e7e5e4", background: "#fff", display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#15803d", fontWeight: 700, fontSize: 13, cursor: "pointer", padding: 0 }}>
            ✕ Close
          </button>
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: "#1c1917" }}>Pick from My Shelves</div>
            <div style={{ fontSize: 10, color: "#9ca3af" }}>{books.length} {books.length === 1 ? "book" : "books"} across all shelves</div>
          </div>
          <div style={{ width: 50 }} />
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          {books.length === 0 ? (
            <div style={{ background: "#fff", borderRadius: 12, padding: "32px 16px", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
              <div style={{ fontSize: 32, marginBottom: 6 }}>📚</div>
              No books saved yet.<br />Add some in the My Shelves tab first.
            </div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter…"
                  style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: "1.5px solid #e2e8f0", fontSize: 13, outline: "none", boxSizing: "border-box", background: "#fff" }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 4 }}>
                <div style={{ fontSize: 12, color: "#78716c", fontWeight: 700 }}>
                  {filtered.length} {filtered.length === 1 ? "match" : "matches"}
                </div>
                <div style={{ fontSize: 12, color: selected.size > 0 ? "#15803d" : "#9ca3af", fontWeight: 700 }}>
                  {selected.size} / {maxToAdd} selected
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {filtered.map((b) => {
                  const sel = selected.has(b.id);
                  const disabled = !sel && selected.size >= maxToAdd;
                  return (
                    <button key={b.id} onClick={() => toggle(b.id)} disabled={disabled}
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
        </div>

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
