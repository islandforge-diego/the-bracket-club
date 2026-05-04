/**
 * BracketFormatSheet — bottom sheet for choosing a bracket format.
 *
 * Looks like LoginModal: portal'd overlay, slide up from bottom on mobile,
 * centered card on desktop.  Tapping a format calls onSelect and closes.
 * Unavailable formats render but are disabled with a "Coming soon" pill.
 *
 * Props
 *   value      currently-selected format id
 *   onSelect   (formatId) => void
 *   onClose    () => void
 */

import { createPortal } from "react-dom";
import { BRACKET_FORMATS } from "./bracketFormats.js";

export default function BracketFormatSheet({ value, onSelect, onClose }) {
  const overlay = (
    <div
      onClick={onClose}
      style={{
        // Higher than CustomBracketCreator (1200) so it stacks ABOVE when
        // opened from inside that modal.  Otherwise the picker renders
        // behind the creator and looks broken.
        position: "fixed", inset: 0, zIndex: 1300,
        background: "rgba(0,0,0,0.45)", display: "flex",
        alignItems: "flex-end", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: "20px 20px 0 0",
          padding: "20px 16px 28px", width: "100%", maxWidth: 460,
          boxShadow: "0 -4px 40px rgba(0,0,0,0.15)",
        }}
      >
        {/* Handle bar */}
        <div style={{ width: 40, height: 4, borderRadius: 2, background: "#e2e8f0", margin: "0 auto 16px" }} />

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 800, fontSize: 18, color: "#1c1917", textAlign: "center" }}>
            Bracket format
          </div>
          <div style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", marginTop: 2 }}>
            How should matchups get paired?
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {BRACKET_FORMATS.map((f) => {
            const selected = f.id === value;
            const dim      = !f.available;

            return (
              <button
                key={f.id}
                onClick={() => f.available && (onSelect(f.id), onClose())}
                disabled={!f.available}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 12,
                  padding: "14px 14px",
                  background: selected ? "#f0fdf4" : "#fff",
                  border: `2px solid ${selected ? "#22c55e" : "#e7e5e4"}`,
                  borderRadius: 14,
                  cursor: f.available ? "pointer" : "default",
                  opacity: dim ? 0.55 : 1,
                  textAlign: "left",
                  transition: "all 0.15s",
                }}
              >
                <span style={{ fontSize: 24, lineHeight: 1, marginTop: 2 }}>{f.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ fontWeight: 800, fontSize: 14, color: "#1c1917" }}>{f.label}</div>
                    {!f.available && (
                      <span style={{ fontSize: 9, fontWeight: 800, color: "#a16207", background: "#fef9c3", borderRadius: 99, padding: "2px 7px", letterSpacing: 0.5, textTransform: "uppercase" }}>
                        Soon
                      </span>
                    )}
                    {selected && (
                      <span style={{ fontSize: 9, fontWeight: 800, color: "#15803d", background: "#dcfce7", borderRadius: 99, padding: "2px 7px", letterSpacing: 0.5, textTransform: "uppercase" }}>
                        Active
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "#78716c", marginTop: 2, lineHeight: 1.4 }}>{f.sub}</div>
                </div>
              </button>
            );
          })}
        </div>

        <button
          onClick={onClose}
          style={{
            marginTop: 14, width: "100%", padding: 12, borderRadius: 10,
            background: "#f1f5f9", color: "#475569", border: "none",
            fontWeight: 700, fontSize: 14, cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
