/**
 * CustomBracketCreator — modal for creating a new (empty) bracket.
 *
 * Only collects metadata: title, size, format, optional month tag.  Books
 * get added INSIDE the bracket via CustomBracketView's add-books mode —
 * splitting setup from book-collection means users can come back later
 * and add more books, and the creation step stays light.
 *
 * On create, persists via createCustomBracket() with empty items[] and
 * calls onCreated(id).
 */

import { useState } from "react";
import { createPortal } from "react-dom";
import { createCustomBracket } from "./customBrackets.js";
import { getFormat, DEFAULT_FORMAT } from "./bracketFormats.js";
import BracketFormatSheet from "./BracketFormatSheet.jsx";
import { FULL } from "./constants.js";

const SIZES = [4, 8, 16];

export default function CustomBracketCreator({ onClose, onCreated }) {
  const [title,           setTitle]           = useState("My Bracket");
  const [size,            setSize]            = useState(8);
  const [format,          setFormat]          = useState(DEFAULT_FORMAT);
  const [month,           setMonth]           = useState(null);          // null = no month, 0..11 = jan..dec
  const [showFormatSheet, setShowFormatSheet] = useState(false);

  const year = new Date().getFullYear();

  // Title default tracks the month when set, but only if the user hasn't
  // typed something custom.  We detect "custom" by comparing to the auto title.
  const autoTitle = month != null ? `Best of ${FULL[month]} ${year}` : "My Bracket";
  const titleIsAuto = title === "My Bracket" || /^Best of /.test(title);

  // Round-robin caps at 6 books — switch to single-elim if user picks bigger
  const formatActive = (size > 6 && format === "round_robin") ? DEFAULT_FORMAT : format;
  const canCreate    = title.trim().length > 0;

  const onMonthChange = (m) => {
    setMonth(m);
    if (titleIsAuto) {
      setTitle(m == null ? "My Bracket" : `Best of ${FULL[m]} ${year}`);
    }
  };

  const doCreate = () => {
    const id = createCustomBracket({
      title:  title.trim(),
      year,
      format: formatActive,
      size,
      month,
      items:  [],
    });
    onCreated?.(id);
  };

  const overlay = (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1200,
        background: "rgba(0,0,0,0.5)", display: "flex",
        alignItems: "flex-end", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#f0fdf4", borderRadius: "20px 20px 0 0",
          padding: "20px 16px 24px", width: "100%", maxWidth: 460,
          boxShadow: "0 -4px 40px rgba(0,0,0,0.15)",
          display: "flex", flexDirection: "column", gap: 14, maxHeight: "90vh", overflowY: "auto",
        }}
      >
        {/* Handle bar */}
        <div style={{ width: 40, height: 4, borderRadius: 2, background: "#e2e8f0", margin: "0 auto" }} />

        <div style={{ textAlign: "center" }}>
          <div style={{ fontWeight: 800, fontSize: 18, color: "#1c1917" }}>New Bracket</div>
          <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>Set it up — add books inside</div>
        </div>

        {/* Title */}
        <label style={{ display: "block" }}>
          <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1, fontWeight: 800, marginBottom: 6 }}>Title</div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Best Sci-Fi 2026"
            style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box", background: "#fff" }}
          />
        </label>

        {/* Size */}
        <div>
          <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1, fontWeight: 800, marginBottom: 6 }}>Bracket size</div>
          <div style={{ display: "flex", gap: 6 }}>
            {SIZES.map((n) => (
              <button key={n} onClick={() => setSize(n)}
                style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "none", background: size === n ? "#14532d" : "#fff", color: size === n ? "#fff" : "#78716c", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
                {n} books
              </button>
            ))}
          </div>
        </div>

        {/* Format */}
        <div>
          <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1, fontWeight: 800, marginBottom: 6 }}>Format</div>
          <button onClick={() => setShowFormatSheet(true)}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", border: "1.5px solid #e2e8f0", borderRadius: 10, background: "#fff", cursor: "pointer", textAlign: "left", fontSize: 14 }}>
            <span style={{ fontSize: 18 }}>{getFormat(formatActive).icon}</span>
            <span style={{ fontWeight: 700, color: "#1c1917" }}>{getFormat(formatActive).label}</span>
            <span style={{ marginLeft: "auto", color: "#a8a29e", fontSize: 12 }}>change ▾</span>
          </button>
        </div>

        {/* Optional month tag */}
        <div>
          <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1, fontWeight: 800, marginBottom: 6 }}>Month tag (optional)</div>
          <select
            value={month == null ? "" : String(month)}
            onChange={(e) => onMonthChange(e.target.value === "" ? null : Number(e.target.value))}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #e2e8f0", background: "#fff", fontSize: 14, color: "#1c1917" }}
          >
            <option value="">No month — free pick</option>
            {FULL.map((m, i) => (
              <option key={m} value={String(i)}>{m} {year}</option>
            ))}
          </select>
        </div>

        {/* Create CTA */}
        <button onClick={doCreate} disabled={!canCreate}
          style={{ marginTop: 4, width: "100%", padding: 14, borderRadius: 10, background: canCreate ? "#14532d" : "#d6d3d1", color: "#fff", border: "none", fontWeight: 800, fontSize: 15, cursor: canCreate ? "pointer" : "default" }}>
          Create Bracket
        </button>

        <button onClick={onClose}
          style={{ width: "100%", padding: 10, borderRadius: 10, background: "transparent", color: "#78716c", border: "none", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
          Cancel
        </button>

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
