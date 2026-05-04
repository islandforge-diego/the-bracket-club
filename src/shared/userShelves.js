/**
 * userShelves.js — the user's named book collections (Goodreads-style).
 *
 * Replaces the old flat bc_user_library.  Lives at bc_user_shelves with shape:
 *
 *   {
 *     "shelf_xyz": {
 *       id, name, icon, createdAt, updatedAt,
 *       books: [
 *         { id, title, author, cover, ..., addedAt },
 *         ...
 *       ]
 *     },
 *     ...
 *   }
 *
 * Books are denormalised per shelf — same book in two shelves is two rows.
 * That's intentional: shelves are user organisation, not a relational
 * graph.  Aggregated views (listAllBooks) dedup by fingerprint when needed.
 *
 * One-time legacy migration runs on import: if bc_user_library exists with
 * books, they're wrapped in a single "Imported Library" shelf and the old
 * key is cleared.
 */

const STORAGE_KEY        = "bc_user_shelves";
const LEGACY_STORAGE_KEY = "bc_user_library";

const DEFAULT_AUTO_SHELF_NAME = "From Brackets";
const DEFAULT_AUTO_SHELF_ICON = "🕐";

function readAll() {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
  catch { return {}; }
}

function writeAll(map) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(map)); }
  catch { /* quota errors swallowed */ }
}

/** Stable dedup fingerprint for a book. */
export function bookFingerprint(book) {
  if (book?.googleBooksId) return `g:${book.googleBooksId}`;
  if (book?.isbn13)        return `i:${book.isbn13}`;
  const t = (book?.title  || "").toLowerCase().trim();
  const a = (book?.author || "").toLowerCase().trim();
  return `t:${t}|${a}`;
}

const newShelfId = () => `shelf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
const newBookId  = () => `bk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

// ── One-time legacy migration ────────────────────────────────────────────
(function migrateLegacyLibrary() {
  if (typeof window === "undefined") return;
  let legacy;
  try { legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY)); } catch { return; }
  if (!legacy || typeof legacy !== "object" || Object.keys(legacy).length === 0) return;
  const all = readAll();
  // Don't run twice — if any shelf already has a "_migratedFromLegacy" flag, skip
  if (Object.values(all).some((s) => s._migratedFromLegacy)) return;

  const id  = newShelfId();
  const now = new Date().toISOString();
  all[id] = {
    id,
    name:    "Imported Library",
    icon:    "📚",
    createdAt: now,
    updatedAt: now,
    _migratedFromLegacy: true,
    books: Object.values(legacy).map((b, i) => ({
      id:            `${newBookId()}_${i}`,
      title:         b.title || "",
      author:        b.author || "",
      cover:         b.cover || "",
      description:   b.description || null,
      rating:        b.rating || null,
      genres:        b.genres || [],
      googleBooksId: b.googleBooksId || null,
      isbn13:        b.isbn13 || null,
      source:        b.source || "migrated",
      addedAt:       b.addedAt || now,
    })),
  };
  writeAll(all);
  try { localStorage.removeItem(LEGACY_STORAGE_KEY); } catch { /* ignore */ }
})();

// ── Shelf CRUD ───────────────────────────────────────────────────────────
export function listShelves() {
  return Object.values(readAll())
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned)
                 || new Date(b.updatedAt) - new Date(a.updatedAt));
}

export function getShelf(id) { return readAll()[id] || null; }

export function createShelf({ name, icon = "📚" }) {
  const id  = newShelfId();
  const now = new Date().toISOString();
  const all = readAll();
  all[id] = { id, name: (name || "Untitled").trim(), icon, createdAt: now, updatedAt: now, books: [] };
  writeAll(all);
  return id;
}

export function renameShelf(id, name, icon) {
  const all = readAll();
  if (!all[id]) return null;
  all[id].name      = (name || all[id].name).trim();
  if (icon) all[id].icon = icon;
  all[id].updatedAt = new Date().toISOString();
  writeAll(all);
  return all[id];
}

export function deleteShelf(id) {
  const all = readAll();
  if (!all[id]) return false;
  delete all[id];
  writeAll(all);
  return true;
}

// ── Book operations ──────────────────────────────────────────────────────
export function addBookToShelf(shelfId, book) {
  if (!book?.title?.trim()) return null;
  const all = readAll();
  const shelf = all[shelfId];
  if (!shelf) return null;
  const fp = bookFingerprint(book);
  const existing = shelf.books.find((b) => bookFingerprint(b) === fp);
  if (existing) return existing.id;
  const id = newBookId();
  shelf.books.push({
    id,
    title:         (book.title  || "").trim(),
    author:        (book.author || "").trim(),
    cover:         book.cover || "",
    description:   book.description || null,
    rating:        book.rating || null,
    genres:        book.genres || [],
    googleBooksId: book.googleBooksId || null,
    isbn13:        book.isbn13 || null,
    source:        book.source || "manual",
    addedAt:       new Date().toISOString(),
  });
  shelf.updatedAt = new Date().toISOString();
  writeAll(all);
  return id;
}

export function addManyBooksToShelf(shelfId, books, source) {
  const all = readAll();
  const shelf = all[shelfId];
  if (!shelf) return 0;
  let added = 0;
  for (const b of books) {
    if (!b?.title?.trim()) continue;
    const fp = bookFingerprint(b);
    if (shelf.books.find((x) => bookFingerprint(x) === fp)) continue;
    shelf.books.push({
      id:            `${newBookId()}_${added}`,
      title:         (b.title  || "").trim(),
      author:        (b.author || "").trim(),
      cover:         b.cover || "",
      description:   b.description || null,
      rating:        b.rating || null,
      genres:        b.genres || [],
      googleBooksId: b.googleBooksId || null,
      isbn13:        b.isbn13 || null,
      source:        source || b.source || "manual",
      addedAt:       new Date().toISOString(),
    });
    added++;
  }
  if (added > 0) {
    shelf.updatedAt = new Date().toISOString();
    writeAll(all);
  }
  return added;
}

export function removeBookFromShelf(shelfId, bookId) {
  const all = readAll();
  const shelf = all[shelfId];
  if (!shelf) return false;
  const before = shelf.books.length;
  shelf.books = shelf.books.filter((b) => b.id !== bookId);
  if (shelf.books.length === before) return false;
  shelf.updatedAt = new Date().toISOString();
  writeAll(all);
  return true;
}

// ── Auto-shelf for bracket additions ─────────────────────────────────────
//
// When a book is added inside a bracket, we still want it to live somewhere
// the user can re-pick it from later.  Find or create the "From Brackets"
// shelf and route the add there.

function ensureAutoShelfId() {
  const all = readAll();
  const existing = Object.values(all).find((s) => s.name === DEFAULT_AUTO_SHELF_NAME);
  if (existing) return existing.id;
  return createShelf({ name: DEFAULT_AUTO_SHELF_NAME, icon: DEFAULT_AUTO_SHELF_ICON });
}

export function addToAutoShelf(book, source = "bracket") {
  const id = ensureAutoShelfId();
  return addBookToShelf(id, { ...book, source });
}

export function addManyToAutoShelf(books, source = "bracket") {
  const id = ensureAutoShelfId();
  return addManyBooksToShelf(id, books, source);
}

// ── Aggregated views (used by LibraryPicker / shelf size checks) ─────────
export function listAllBooks() {
  const seen = new Set();
  const out  = [];
  for (const shelf of listShelves()) {
    for (const b of shelf.books) {
      const fp = bookFingerprint(b);
      if (seen.has(fp)) continue;
      seen.add(fp);
      out.push({ ...b, _shelfName: shelf.name });
    }
  }
  return out;
}

export function totalBookCount() {
  return listAllBooks().length;
}

export function shelfCount() {
  return Object.keys(readAll()).length;
}
