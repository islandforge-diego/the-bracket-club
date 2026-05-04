/**
 * userLibrary.js — the user's personal book collection.
 *
 * Lives in localStorage at bc_user_library.  Every book the user adds via
 * search, Goodreads import, manual entry, or as a side-effect of adding to
 * a bracket gets stashed here so they can quickly pull from it next time.
 *
 * Dedup is by best-available identifier (Google Books ID > ISBN-13 > title +
 * author).  The storage shape uses the fingerprint as the key so duplicate
 * inserts are a no-op without scanning the whole list.
 *
 * Future cloud sync (Supabase) is a one-table swap-in — every entry already
 * has a stable `id` separate from the fingerprint key.
 */

const STORAGE_KEY = "bc_user_library";

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

/** Stable dedup key for a book. */
export function bookFingerprint(book) {
  if (book?.googleBooksId)             return `g:${book.googleBooksId}`;
  if (book?.isbn13)                    return `i:${book.isbn13}`;
  const t = (book?.title  || "").toLowerCase().trim();
  const a = (book?.author || "").toLowerCase().trim();
  return `t:${t}|${a}`;
}

/** Every saved book, newest-added first. */
export function listLibrary() {
  return Object.values(readAll())
    .sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));
}

/** Number of distinct books in the library. */
export function librarySize() {
  return Object.keys(readAll()).length;
}

/** Already-have check by book fingerprint. */
export function isInLibrary(book) {
  return !!readAll()[bookFingerprint(book)];
}

/**
 * Insert (or no-op if already present).  Returns the entry's stable id —
 * either the existing one or a freshly generated one.
 *
 * `source` is a small free-text tag we surface in the UI so the user knows
 * where each book came from ("search", "goodreads", "manual", "bracket").
 */
export function addToLibrary(book, source = "manual") {
  if (!book?.title?.trim()) return null;
  const all = readAll();
  const key = bookFingerprint(book);
  if (all[key]) return all[key].id;
  const id = `lib_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  all[key] = {
    id,
    title:         (book.title  || "").trim(),
    author:        (book.author || "").trim(),
    cover:         book.cover         || "",
    description:   book.description   || null,
    rating:        book.rating        || null,
    genres:        book.genres        || [],
    googleBooksId: book.googleBooksId || null,
    isbn13:        book.isbn13        || null,
    source,
    addedAt:       new Date().toISOString(),
  };
  writeAll(all);
  return id;
}

/** Bulk-add (deduped); returns the count of NEW entries actually inserted. */
export function addManyToLibrary(books, source = "manual") {
  const all = readAll();
  let added = 0;
  for (const b of books) {
    if (!b?.title?.trim()) continue;
    const key = bookFingerprint(b);
    if (all[key]) continue;
    const id = `lib_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}_${added}`;
    all[key] = {
      id,
      title:         (b.title  || "").trim(),
      author:        (b.author || "").trim(),
      cover:         b.cover         || "",
      description:   b.description   || null,
      rating:        b.rating        || null,
      genres:        b.genres        || [],
      googleBooksId: b.googleBooksId || null,
      isbn13:        b.isbn13        || null,
      source,
      addedAt:       new Date().toISOString(),
    };
    added++;
  }
  if (added > 0) writeAll(all);
  return added;
}

/** Remove by entry id (returns true if anything was removed). */
export function removeFromLibrary(id) {
  const all = readAll();
  for (const k of Object.keys(all)) {
    if (all[k].id === id) {
      delete all[k];
      writeAll(all);
      return true;
    }
  }
  return false;
}
