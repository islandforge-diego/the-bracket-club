/**
 * ShelfDetailPage — view + curate one shelf.
 *
 * Layout (top → bottom):
 *   1. Header (back · shelf icon + name · rename)
 *   2. Search bar (Google Books–backed instant add)
 *   3. Three primary import paths in a 2×2 grid:
 *        📚 Goodreads · 📄 CSV · 📋 Paste
 *      ("Add manually" sits under the book list as a small footer link)
 *   4. Book list with swipe-left to remove
 *   5. Footer "Can't find it? Add manually" — quiet, secondary
 */

import { useState } from "react";
import Cover from "./Cover.jsx";
import ItemSearch from "./ItemSearch.jsx";
import GoodreadsImporter from "./GoodreadsImporter.jsx";
import CSVImporter from "./CSVImporter.jsx";
import PasteListImporter from "./PasteListImporter.jsx";
import ShelfCreateModal from "./ShelfCreateModal.jsx";
import SwipeableRow from "./SwipeableRow.jsx";
import { searchBooks } from "../categories/books/data.js";
import { getShelf, addBookToShelf, addManyBooksToShelf, removeBookFromShelf, deleteShelf } from "./userShelves.js";
import { playUI, playStar } from "./soundscape.js";

export default function ShelfDetailPage({ shelfId, onBack }) {
  const [_, force]                  = useState(0);
  const rerender                    = () => force((n) => n + 1);
  const [showImporter, setShowI]    = useState(false);
  const [showCSV,      setShowCSV]  = useState(false);
  const [showPaste,    setShowPaste]= useState(false);
  const [showRename,   setRename]   = useState(false);

  const shelf = getShelf(shelfId);

  if (!shelf) {
    return (
      <div style={{ padding: 20, textAlign: "center", color: "#9ca3af" }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: "#15803d", fontWeight: 700, fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 12 }}>
          ‹ Back to Shelves
        </button>
        <div>This shelf no longer exists.</div>
      </div>
    );
  }

  const onAddOne = (b, source) => {
    if (!b?.title?.trim()) return;
    const id = addBookToShelf(shelfId, { ...b, source });
    if (id) playStar();
    rerender();
  };

  const onAddMany = (books, source) => {
    const n = addManyBooksToShelf(shelfId, books, source);
    if (n > 0) playStar();
    rerender();
  };

  const onManual = () => {
    const title = window.prompt("Book title?");
    if (!title) return;
    const author = window.prompt("Author? (optional)") || "";
    onAddOne({ title, author, cover: "" }, "manual");
  };

  const onRemove = (id) => {
    removeBookFromShelf(shelfId, id);
    playUI("back");
    rerender();
  };

  const onDeleteShelf = () => {
    if (!confirm(`Delete the entire "${shelf.name}" shelf?  Books inside it will be lost.`)) return;
    deleteShelf(shelfId);
    onBack?.();
  };

  return (
    <div style={{ padding: "16px 16px 24px", display: "flex", flexDirection: "column", gap: 14, maxWidth: 600, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
        <button onClick={onBack}
          style={{ background: "none", border: "none", color: "#15803d", fontWeight: 700, fontSize: 13, cursor: "pointer", padding: 0 }}>
          ‹ Shelves
        </button>
        <div style={{ flex: 1, textAlign: "center", display: "flex", justifyContent: "center", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 22 }}>{shelf.icon}</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, color: "#1c1917" }}>{shelf.name}</div>
            <div style={{ fontSize: 11, color: "#9ca3af" }}>{shelf.books.length} {shelf.books.length === 1 ? "book" : "books"}</div>
          </div>
        </div>
        <button onClick={() => setRename(true)}
          style={{ background: "none", border: "none", color: "#9ca3af", fontSize: 18, cursor: "pointer", padding: "4px 8px" }}>
          ✎
        </button>
      </div>

      {/* Search */}
      <ItemSearch
        placeholder="Search to add a book…"
        searchFn={searchBooks}
        onSelect={(b) => onAddOne(b, "search")}
        onManual={onManual}
      />

      {/* Bulk import options — 2×2 grid (manual goes in footer) */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <ImportTile icon="📚" label="From Goodreads"  sub="Public profile link"     onClick={() => { playUI("tap"); setShowI(true); }} />
        <ImportTile icon="📄" label="Upload CSV"      sub="Goodreads or StoryGraph" onClick={() => { playUI("tap"); setShowCSV(true); }} />
        <ImportTile icon="📋" label="Paste a list"    sub="One title per line"      onClick={() => { playUI("tap"); setShowPaste(true); }} fullWidth />
      </div>

      {/* Book list */}
      {shelf.books.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 16, padding: "32px 20px", textAlign: "center", color: "#9ca3af", fontSize: 13, boxShadow: "0 1px 4px #0001" }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>{shelf.icon}</div>
          This shelf is empty — add some books above.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {shelf.books.map((b) => (
            <SwipeableRow key={b.id}
              onSwipeLeft={() => onRemove(b.id)}
              onSwipeRight={null}
              leftLabel="Remove" leftIcon="🗑️" leftBg="#dc2626"
              borderRadius={12}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12, background: "#fff", borderRadius: 12, padding: "10px 12px", boxShadow: "0 1px 4px #0001" }}>
                <Cover book={b} size="xs" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#1c1917", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.title}</div>
                  {b.author && <div style={{ fontSize: 11, color: "#78716c", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.author}</div>}
                </div>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#a8a29e", textTransform: "uppercase", letterSpacing: 0.5 }}>
                  {b.source}
                </div>
              </div>
            </SwipeableRow>
          ))}
        </div>
      )}

      {/* Quiet footer — add manually + delete shelf */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, padding: "0 4px" }}>
        <button onClick={() => { playUI("tap"); onManual(); }}
          style={{ background: "none", border: "none", color: "#78716c", fontSize: 11, cursor: "pointer", padding: 4 }}>
          Can't find it?  Add manually
        </button>
        <button onClick={onDeleteShelf}
          style={{ background: "none", border: "none", color: "#dc2626", fontSize: 11, fontWeight: 700, cursor: "pointer", padding: 4 }}>
          🗑️ Delete shelf
        </button>
      </div>

      {showImporter && (
        <GoodreadsImporter
          maxToAdd={1000} destinationLabel="shelf"
          onImport={(picked) => { onAddMany(picked, "goodreads"); setShowI(false); }}
          onClose={() => setShowI(false)}
        />
      )}
      {showCSV && (
        <CSVImporter
          maxToAdd={1000} destinationLabel="shelf"
          onImport={(picked) => { onAddMany(picked, "csv"); setShowCSV(false); }}
          onClose={() => setShowCSV(false)}
        />
      )}
      {showPaste && (
        <PasteListImporter
          maxToAdd={1000} destinationLabel="shelf"
          onImport={(picked) => { onAddMany(picked, "paste"); setShowPaste(false); }}
          onClose={() => setShowPaste(false)}
        />
      )}
      {showRename && (
        <ShelfCreateModal
          existing={shelf}
          onClose={() => setRename(false)}
          onCreated={() => { setRename(false); rerender(); }}
        />
      )}
    </div>
  );
}

function ImportTile({ icon, label, sub, onClick, fullWidth }) {
  return (
    <button onClick={onClick}
      style={{
        gridColumn: fullWidth ? "span 2" : undefined,
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 12px", background: "#fff",
        border: "1.5px dashed #d6d3d1", borderRadius: 12,
        cursor: "pointer", textAlign: "left",
      }}>
      <span style={{ fontSize: 20 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 12, color: "#1c1917" }}>{label}</div>
        <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 1 }}>{sub}</div>
      </div>
    </button>
  );
}
