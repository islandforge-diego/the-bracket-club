/**
 * PasteListImporter — paste a list of titles to bulk-add.
 *
 * Each non-empty line becomes one book.  Supported line formats:
 *
 *   The Road
 *   The Road - Cormac McCarthy
 *   The Road — Cormac McCarthy
 *   The Road by Cormac McCarthy
 *   "The Road", Cormac McCarthy
 *
 * Author parsing is best-effort — if we can't split confidently, the
 * whole line becomes the title and author stays empty (still importable;
 * user can edit later).
 *
 * No filters / multi-select grid here — paste-list is the express lane,
 * preview shows what we parsed and one button confirms the import.
 *
 * Props
 *   maxToAdd            slots remaining
 *   onImport            (books) => void
 *   onClose             () => void
 *   destinationLabel    "library" | "bracket"
 */

import { useState } from "react";
import { createPortal } from "react-dom";

const SEPARATORS = [" — ", " – ", " - ", " by ", ", "];

function parseLine(raw) {
  let line = raw.trim();
  if (!line) return null;

  // Strip a leading "1.", "1)", "•", "-" etc.  to handle numbered lists
  line = line.replace(/^[\d\)\.\-•\*\s]+/, "").trim();

  // Strip outer matching quotes
  if ((line.startsWith('"') && line.endsWith('"')) || (line.startsWith("'") && line.endsWith("'"))) {
    line = line.slice(1, -1).trim();
  }

  // Try each separator in priority order
  for (const sep of SEPARATORS) {
    const idx = line.toLowerCase().indexOf(sep.toLowerCase());
    if (idx > 0) {
      const title  = line.slice(0, idx).replace(/^["']|["']$/g, "").trim();
      const author = line.slice(idx + sep.length).replace(/^["']|["']$/g, "").trim();
      if (title) return { title, author, cover: "" };
    }
  }

  return { title: line, author: "", cover: "" };
}

export default function PasteListImporter({ maxToAdd, onImport, onClose, destinationLabel = "library" }) {
  const [text, setText] = useState("");

  // Parse on the fly so the user sees a live preview
  const parsed = text
    .split("\n")
    .map(parseLine)
    .filter(Boolean);

  const willAdd = parsed.slice(0, maxToAdd);
  const truncated = parsed.length > maxToAdd;

  const doImport = () => {
    if (willAdd.length === 0) return;
    onImport?.(willAdd);
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
            <div style={{ fontWeight: 800, fontSize: 14, color: "#1c1917" }}>Paste a List</div>
            <div style={{ fontSize: 10, color: "#9ca3af" }}>One book per line</div>
          </div>
          <div style={{ width: 50 }} />
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`The Road — Cormac McCarthy\n1984 — George Orwell\nDune\nProject Hail Mary by Andy Weir\n…`}
            rows={8}
            style={{
              width: "100%", padding: "10px 12px", borderRadius: 10,
              border: "1.5px solid #e2e8f0", fontSize: 13,
              outline: "none", boxSizing: "border-box",
              background: "#fff", fontFamily: "inherit", resize: "vertical",
            }}
          />

          <div style={{ padding: "10px 12px", background: "#f0fdf4", borderRadius: 10, border: "1px solid #dcfce7" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#15803d", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
              Tip
            </div>
            <div style={{ fontSize: 12, color: "#166534", lineHeight: 1.55 }}>
              Use <code style={{ background: "#dcfce7", padding: "0 4px", borderRadius: 3 }}>Title — Author</code> or <code style={{ background: "#dcfce7", padding: "0 4px", borderRadius: 3 }}>Title by Author</code> on each line.  Just titles work too.
            </div>
          </div>

          {parsed.length > 0 && (
            <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 4px #0001", overflow: "hidden" }}>
              <div style={{ padding: "8px 12px", background: "#fafaf9", borderBottom: "1px solid #f5f5f4", fontSize: 11, fontWeight: 800, color: "#78716c", textTransform: "uppercase", letterSpacing: 1, display: "flex", justifyContent: "space-between" }}>
                <span>Preview</span>
                <span style={{ color: truncated ? "#dc2626" : "#15803d" }}>
                  {willAdd.length} ready{truncated ? ` · ${parsed.length - maxToAdd} won't fit` : ""}
                </span>
              </div>
              <div style={{ maxHeight: 240, overflowY: "auto" }}>
                {willAdd.map((b, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderTop: i ? "1px solid #f5f5f4" : "none" }}>
                    <div style={{ width: 22, textAlign: "center", fontWeight: 800, fontSize: 12, color: "#9ca3af" }}>{i + 1}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: "#1c1917", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.title}</div>
                      {b.author && <div style={{ fontSize: 11, color: "#78716c", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.author}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ borderTop: "1px solid #e7e5e4", background: "#fff", padding: "10px 14px" }}>
          <button onClick={doImport} disabled={willAdd.length === 0}
            style={{ width: "100%", padding: 13, borderRadius: 10, background: willAdd.length === 0 ? "#d6d3d1" : "#14532d", color: "#fff", border: "none", fontWeight: 800, fontSize: 14, cursor: willAdd.length === 0 ? "default" : "pointer" }}>
            {willAdd.length === 0 ? "Paste at least one title" : `Add ${willAdd.length} ${willAdd.length === 1 ? "book" : "books"} to ${destinationLabel}`}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
