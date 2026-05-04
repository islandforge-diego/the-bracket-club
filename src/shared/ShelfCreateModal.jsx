/**
 * ShelfCreateModal — small bottom-sheet for naming a new shelf.
 *
 * Inputs: name (required) + icon (emoji picker, small set).  On create,
 * calls createShelf and then onCreated(id) so callers can navigate the
 * user straight into the new shelf.
 *
 * Reused for renaming too — pass an `existing` shelf and the modal flips
 * to "Rename Shelf" mode.
 */

import { useState } from "react";
import { createPortal } from "react-dom";
import { createShelf, renameShelf } from "./userShelves.js";

const ICONS = ["📚", "⭐", "📖", "🔥", "❤️", "🎯", "🏆", "🌟", "📕", "📗", "📘", "📙", "🪐", "🌙", "🐉"];

export default function ShelfCreateModal({ existing, onClose, onCreated }) {
  const [name, setName] = useState(existing?.name || "");
  const [icon, setIcon] = useState(existing?.icon || ICONS[0]);

  const isRename = !!existing;
  const canSave  = name.trim().length > 0;

  const doSave = () => {
    if (!canSave) return;
    if (isRename) {
      renameShelf(existing.id, name.trim(), icon);
      onCreated?.(existing.id);
    } else {
      const id = createShelf({ name: name.trim(), icon });
      onCreated?.(id);
    }
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
          display: "flex", flexDirection: "column", gap: 14,
        }}
      >
        <div style={{ width: 40, height: 4, borderRadius: 2, background: "#e2e8f0", margin: "0 auto" }} />

        <div style={{ textAlign: "center" }}>
          <div style={{ fontWeight: 800, fontSize: 18, color: "#1c1917" }}>
            {isRename ? "Rename Shelf" : "New Shelf"}
          </div>
          <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
            {isRename ? "Update name or icon" : "Group your books however you like"}
          </div>
        </div>

        {/* Name */}
        <label style={{ display: "block" }}>
          <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1, fontWeight: 800, marginBottom: 6 }}>Shelf name</div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. 5-Star Reads, To Read, Sci-Fi…"
            autoFocus
            style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box", background: "#fff" }}
          />
        </label>

        {/* Icon picker */}
        <div>
          <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1, fontWeight: 800, marginBottom: 6 }}>Icon</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 6 }}>
            {ICONS.map((em) => (
              <button key={em} onClick={() => setIcon(em)}
                style={{
                  padding: "10px 0", borderRadius: 10,
                  background: icon === em ? "#dcfce7" : "#fff",
                  border: `2px solid ${icon === em ? "#22c55e" : "#e7e5e4"}`,
                  cursor: "pointer", fontSize: 18,
                }}>
                {em}
              </button>
            ))}
          </div>
        </div>

        <button onClick={doSave} disabled={!canSave}
          style={{ marginTop: 4, width: "100%", padding: 14, borderRadius: 10, background: canSave ? "#14532d" : "#d6d3d1", color: "#fff", border: "none", fontWeight: 800, fontSize: 15, cursor: canSave ? "pointer" : "default" }}>
          {isRename ? "Save changes" : "Create Shelf"}
        </button>

        <button onClick={onClose}
          style={{ width: "100%", padding: 10, borderRadius: 10, background: "transparent", color: "#78716c", border: "none", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
          Cancel
        </button>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
