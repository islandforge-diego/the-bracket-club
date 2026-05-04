/**
 * LibraryPage — the user's personal book collection.
 *
 *   Top:    header with count
 *   Mid:    three add actions — Search, Goodreads import, Manual
 *   Body:   list of saved books, each swipe-left to delete
 *   Empty:  starter state explaining what the library is for
 *
 * Books added here become quick-pick options in the bracket creation flow
 * (via LibraryPicker).  Books added IN a bracket also flow back here, so
 * the collection grows passively as the user uses the app.
 */

import { useState } from "react";
import Cover from "./Cover.jsx";
import ItemSearch from "./ItemSearch.jsx";
import GoodreadsImporter from "./GoodreadsImporter.jsx";
import SwipeableRow from "./SwipeableRow.jsx";
import { searchBooks } from "../categories/books/data.js";
import { listLibrary, addToLibrary, addManyToLibrary, removeFromLibrary } from "./userLibrary.js";
import { playUI, playStar } from "./soundscape.js";

export default function LibraryPage() {
  const [_, force]               = useState(0);
  const rerender                 = () => force((n) => n + 1);
  const [showImporter, setShowI] = useState(false);

  const books = listLibrary();

  const onAddOne = (b, source) => {
    if (!b?.title?.trim()) return;
    const id = addToLibrary(b, source);
    if (id) playStar();
    rerender();
  };

  const onManual = () => {
    const title = window.prompt("Book title?");
    if (!title) return;
    const author = window.prompt("Author? (optional)") || "";
    onAddOne({ title, author, cover: "" }, "manual");
  };

  const onRemove = (id) => {
    removeFromLibrary(id);
    playUI("back");
    rerender();
  };

  return (
    <div style={{ padding: "16px 16px 24px", display: "flex", flexDirection: "column", gap: 14, maxWidth: 600, margin: "0 auto" }}>
      <div style={{ textAlign: "center", paddingTop: 8 }}>
        <div style={{ fontWeight: 800, fontSize: 24, color: "#1c1917" }}>My Library</div>
        <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>
          {books.length === 0
            ? "Save books once — pick them quickly into brackets later"
            : `${books.length} ${books.length === 1 ? "book" : "books"} saved`}
        </div>
      </div>

      {/* Search + add directly */}
      <div>
        <ItemSearch
          placeholder="Search to add a book…"
          searchFn={searchBooks}
          onSelect={(b) => onAddOne(b, "search")}
          onManual={onManual}
        />
      </div>

      {/* Bulk import + manual, side by side */}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => { playUI("tap"); setShowI(true); }}
          style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "#fff", border: "1.5px dashed #d6d3d1", borderRadius: 12, cursor: "pointer", textAlign: "left" }}>
          <span style={{ fontSize: 18 }}>📚</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: "#1c1917" }}>Import from Goodreads</div>
            <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 1 }}>Pull your read shelf in bulk</div>
          </div>
        </button>
        <button onClick={() => { playUI("tap"); onManual(); }}
          style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "#fff", border: "1.5px dashed #d6d3d1", borderRadius: 12, cursor: "pointer", textAlign: "left" }}>
          <span style={{ fontSize: 18 }}>✏️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: "#1c1917" }}>Add manually</div>
            <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 1 }}>Title + author</div>
          </div>
        </button>
      </div>

      {/* List */}
      {books.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 16, padding: "32px 20px", textAlign: "center", color: "#9ca3af", fontSize: 13, boxShadow: "0 1px 4px #0001" }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>📚</div>
          Add your first book above.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {books.map((b) => (
            <SwipeableRow key={b.id}
              onSwipeLeft={() => onRemove(b.id)}
              onSwipeRight={null}             /* nothing on the right side here */
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

      {showImporter && (
        <GoodreadsImporter
          maxToAdd={1000}                     /* no real cap for library import */
          onImport={(picked) => {
            const n = addManyToLibrary(picked, "goodreads");
            if (n > 0) playStar();
            setShowI(false);
            rerender();
          }}
          onClose={() => setShowI(false)}
        />
      )}
    </div>
  );
}
