/**
 * MyShelvesPage — landing page (default tab) listing the user's shelves.
 *
 * Layout:
 *   - Header: "My Shelves"
 *   - Primary CTA: + Create a Shelf
 *   - List of shelves (card per shelf, swipe-left to delete)
 *   - Empty state for first-time users
 *
 * Tap a shelf → onOpenShelf(id) → ShelfDetailPage
 */

import { useState } from "react";
import SwipeableRow from "./SwipeableRow.jsx";
import ShelfCreateModal from "./ShelfCreateModal.jsx";
import { listShelves, deleteShelf } from "./userShelves.js";
import { playUI } from "./soundscape.js";

export default function MyShelvesPage({ onOpenShelf }) {
  const [_, force]                  = useState(0);
  const rerender                    = () => force((n) => n + 1);
  const [showCreate, setShowCreate] = useState(false);

  const shelves = listShelves();

  const onDelete = (s) => {
    if (!confirm(`Delete the "${s.name}" shelf?  Books inside it will be lost.`)) return;
    deleteShelf(s.id);
    playUI("back");
    rerender();
  };

  const cardStyle = {
    width: "100%", display: "flex", alignItems: "center", gap: 14,
    background: "#fff", border: "none", borderRadius: 16,
    padding: "16px 16px", boxShadow: "0 1px 4px #0001",
    cursor: "pointer", textAlign: "left",
  };

  return (
    <div style={{ padding: "16px 16px 24px", display: "flex", flexDirection: "column", gap: 14, maxWidth: 600, margin: "0 auto" }}>

      <div style={{ textAlign: "center", paddingTop: 8 }}>
        <div style={{ fontWeight: 800, fontSize: 24, color: "#1c1917" }}>My Shelves</div>
        <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>
          {shelves.length === 0
            ? "Group books however you like, then pick from any shelf when building a bracket"
            : `${shelves.length} ${shelves.length === 1 ? "shelf" : "shelves"}`}
        </div>
      </div>

      {/* Primary CTA */}
      <button onClick={() => { playUI("tap"); setShowCreate(true); }}
        style={{ ...cardStyle, background: "#14532d", color: "#fff", boxShadow: "0 4px 14px rgba(20,83,45,0.25)", padding: "16px 18px" }}>
        <span style={{ fontSize: 28 }}>✨</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: "#fff" }}>Create a Shelf</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", marginTop: 2 }}>
            Name it whatever — "5-Star Reads", "To Read", "Sci-Fi"…
          </div>
        </div>
        <span style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>+</span>
      </button>

      {/* Shelves list */}
      {shelves.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 16, padding: "32px 20px", textAlign: "center", color: "#9ca3af", fontSize: 13, boxShadow: "0 1px 4px #0001" }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>📚</div>
          No shelves yet — tap above to create your first one.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {shelves.map((s) => (
            <SwipeableRow key={s.id}
              onSwipeLeft={() => onDelete(s)}
              onSwipeRight={null}
              leftLabel="Delete" leftIcon="🗑️" leftBg="#dc2626"
            >
              <button onClick={() => { playUI("select"); onOpenShelf(s.id); }} style={cardStyle}>
                <span style={{ fontSize: 32 }}>{s.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 15, color: "#1c1917", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.name}
                  </div>
                  <div style={{ fontSize: 12, color: "#78716c", marginTop: 2 }}>
                    {s.books.length} {s.books.length === 1 ? "book" : "books"}
                  </div>
                </div>
                <span style={{ color: "#d6d3d1", fontSize: 18 }}>›</span>
              </button>
            </SwipeableRow>
          ))}
        </div>
      )}

      {showCreate && (
        <ShelfCreateModal
          onClose={() => setShowCreate(false)}
          onCreated={(id) => { setShowCreate(false); onOpenShelf(id); }}
        />
      )}
    </div>
  );
}
