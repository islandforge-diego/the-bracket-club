/**
 * CustomBracketCreator — single-screen wizard for creating a catalog bracket.
 *
 * Layout (top → bottom):
 *   1. Year picker      (‹ 2024 ›)
 *   2. Size toggle      (4 / 8 / 16 books)
 *   3. Format picker    (opens the existing BracketFormatSheet)
 *   4. Book grid        (top-N from catalog for the year, multi-select)
 *   5. Title input      (auto-defaults to "Best of <year>")
 *   6. Create CTA       (disabled until selection count matches size)
 *
 * On create, persists via createCustomBracket() and calls onCreated(id).
 */

import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import Cover from "./Cover.jsx";
import { getTopBooksForYear, getYearsWithReleases } from "../lib/db.js";
import { createCustomBracket } from "./customBrackets.js";
import { BRACKET_FORMATS, getFormat, DEFAULT_FORMAT } from "./bracketFormats.js";
import BracketFormatSheet from "./BracketFormatSheet.jsx";

const SIZES = [4, 8, 16];

export default function CustomBracketCreator({ onClose, onCreated }) {
  const [year,         setYear]         = useState(new Date().getFullYear());
  const [size,         setSize]         = useState(8);
  const [format,       setFormat]       = useState(DEFAULT_FORMAT);
  const [showFormatSheet, setShowFormatSheet] = useState(false);
  const [catalog,      setCatalog]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [picked,       setPicked]       = useState(new Set());
  const [title,        setTitle]        = useState(`Best of ${new Date().getFullYear()}`);
  const [yearsAvail,   setYearsAvail]   = useState([]);

  // Load list of years that actually have catalog books (ascending so prev/next works)
  useEffect(() => {
    getYearsWithReleases().then((ys) => setYearsAvail(ys));
  }, []);

  // Load top N books whenever year changes
  useEffect(() => {
    setLoading(true);
    setPicked(new Set());
    getTopBooksForYear(year, 30)
      .then((books) => { setCatalog(books); setLoading(false); })
      .catch(() => { setCatalog([]); setLoading(false); });
    setTitle(`Best of ${year}`);
  }, [year]);

  const minYear = yearsAvail.length ? yearsAvail[yearsAvail.length - 1] : 1950;
  const maxYear = yearsAvail.length ? yearsAvail[0] : new Date().getFullYear();

  const togglePick = (id) => {
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id))      next.delete(id);
      else if (next.size < size) next.add(id);
      return next;
    });
  };

  // Round-robin only allowed for ≤6 items; auto-suggest single_elim if size > 6
  const formatActive = (size > 6 && format === "round_robin") ? DEFAULT_FORMAT : format;

  const canCreate = picked.size === size && title.trim().length > 0 && !loading;

  const doCreate = () => {
    const items = catalog
      .filter((b) => picked.has(b.id))
      .map((b) => ({
        id:      b.id,
        title:   b.title,
        author:  (b.creators || [])[0] || "",
        cover:   b.cover_url || "",
        rating:  null,
        external_ids: b.external_ids || {},
      }));
    const id = createCustomBracket({
      title:  title.trim(),
      year,
      items,
      format: formatActive,
    });
    onCreated?.(id);
  };

  const overlay = (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1200,
        background: "rgba(0,0,0,0.5)", display: "flex",
        alignItems: "stretch", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#f0fdf4", width: "100%", maxWidth: 480,
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        {/* ── Header ──────────────────────────────────────────────── */}
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #e7e5e4", background: "#fff", display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#15803d", fontWeight: 700, fontSize: 13, cursor: "pointer", padding: 0 }}>
            ✕ Cancel
          </button>
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 13, fontWeight: 800, color: "#1c1917" }}>New Custom Bracket</div>
          <div style={{ flex: 1 }} />
          <div style={{ width: 60 }} />
        </div>

        {/* ── Scrollable body ─────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Year picker */}
          <div style={{ background: "#fff", borderRadius: 14, padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
            <button onClick={() => setYear((y) => Math.max(minYear, y - 1))} disabled={year <= minYear}
              style={{ width: 30, height: 30, borderRadius: 99, border: "1px solid #e7e5e4", background: "#fff", fontSize: 14, cursor: year <= minYear ? "default" : "pointer", color: year <= minYear ? "#d6d3d1" : "#14532d", padding: 0 }}>‹</button>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1.5 }}>Year</div>
              <div style={{ fontWeight: 800, fontSize: 18, color: "#1c1917" }}>{year}</div>
            </div>
            <button onClick={() => setYear((y) => Math.min(maxYear, y + 1))} disabled={year >= maxYear}
              style={{ width: 30, height: 30, borderRadius: 99, border: "1px solid #e7e5e4", background: "#fff", fontSize: 14, cursor: year >= maxYear ? "default" : "pointer", color: year >= maxYear ? "#d6d3d1" : "#14532d", padding: 0 }}>›</button>
          </div>

          {/* Size + format pills */}
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1, background: "#fff", borderRadius: 14, padding: "8px 10px" }}>
              <div style={{ fontSize: 10, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1, fontWeight: 800, marginBottom: 6 }}>Bracket size</div>
              <div style={{ display: "flex", gap: 4 }}>
                {SIZES.map((n) => (
                  <button key={n} onClick={() => setSize(n)}
                    style={{ flex: 1, padding: "6px 0", borderRadius: 8, border: "none", background: size === n ? "#14532d" : "#f5f5f4", color: size === n ? "#fff" : "#78716c", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={() => setShowFormatSheet(true)}
              style={{ background: "#fff", border: "none", borderRadius: 14, padding: "8px 12px", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, cursor: "pointer" }}>
              <div style={{ fontSize: 10, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1, fontWeight: 800 }}>Format</div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span>{getFormat(formatActive).icon}</span>
                <span style={{ fontWeight: 800, fontSize: 13, color: "#1c1917" }}>{getFormat(formatActive).label}</span>
                <span style={{ color: "#a8a29e", fontSize: 10 }}>▾</span>
              </div>
            </button>
          </div>

          {/* Selection counter */}
          <div style={{ textAlign: "center", padding: "4px 0" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: picked.size === size ? "#15803d" : "#78716c" }}>
              {picked.size} of {size} books picked
            </span>
          </div>

          {/* Catalog grid */}
          {loading ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#9ca3af" }}>Loading catalog…</div>
          ) : catalog.length === 0 ? (
            <div style={{ background: "#fff", borderRadius: 14, padding: "24px 16px", textAlign: "center", color: "#78716c", fontSize: 13 }}>
              No catalog books found for {year}.<br />Try another year.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {catalog.map((b) => {
                const sel = picked.has(b.id);
                const disabled = !sel && picked.size >= size;
                const book = { id: b.id, title: b.title, cover: b.cover_url || "", author: (b.creators||[])[0] || "" };
                return (
                  <button key={b.id} onClick={() => togglePick(b.id)} disabled={disabled}
                    style={{
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                      padding: 8, background: sel ? "#f0fdf4" : "#fff",
                      border: `2px solid ${sel ? "#22c55e" : "#e7e5e4"}`,
                      borderRadius: 10, cursor: disabled ? "default" : "pointer",
                      opacity: disabled ? 0.5 : 1, position: "relative",
                      transition: "all .15s",
                    }}>
                    <Cover book={book} size="sm" />
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#1c1917", textAlign: "center", lineHeight: 1.2, maxHeight: 24, overflow: "hidden" }}>
                      {b.title}
                    </div>
                    {sel && (
                      <span style={{ position: "absolute", top: 4, right: 4, background: "#22c55e", color: "#fff", borderRadius: 99, width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800 }}>
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Footer: title + create ───────────────────────────────── */}
        <div style={{ borderTop: "1px solid #e7e5e4", background: "#fff", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          <input
            value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="Bracket title"
            style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box" }}
          />
          <button onClick={doCreate} disabled={!canCreate}
            style={{ width: "100%", padding: 14, borderRadius: 10, background: canCreate ? "#14532d" : "#d6d3d1", color: "#fff", border: "none", fontWeight: 800, fontSize: 14, cursor: canCreate ? "pointer" : "default" }}>
            {canCreate ? "Create Bracket" : `Pick ${size - picked.size} more`}
          </button>
        </div>

        {showFormatSheet && (
          <BracketFormatSheet
            value={format}
            onSelect={(f) => setFormat(f)}
            onClose={() => setShowFormatSheet(false)}
          />
        )}
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
