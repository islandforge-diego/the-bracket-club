/**
 * customBrackets.js — localStorage layer for catalog brackets.
 *
 * Custom brackets are user-created tournaments built from catalog books
 * (any year), distinct from the per-year "My Shelf" annual bracket.  They
 * live cross-year so they get their own storage key rather than the
 * year-keyed shelf store.
 *
 * Shape on disk:
 *   {
 *     "uuid": {
 *       id, title, year, items[], picks{}, format, winner, createdAt, updatedAt
 *     },
 *     ...
 *   }
 *
 * Field notes:
 *   items[]  — frozen book objects at create time (catalog rows we copied).
 *              Stored on the bracket so future catalog edits don't break
 *              an in-progress bracket.
 *   picks{}  — matchId → winner book.  Same shape as the existing knockout
 *              and round-robin bracket picks so renderers don't need to
 *              special-case anything.
 *   format   — bracketFormats id (single_elim / seeded_by_rating /
 *              round_robin / double_elim).
 *   winner   — set when champion is crowned; UI shows it in the hub list.
 *
 * Cloud sync (Supabase) is intentionally deferred — this is local-first.
 */

import { schedulePush, tombstone } from "./cloudSync.js";

const STORAGE_KEY = "bc_custom_brackets";

function readAll() {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function writeAll(map) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* quota errors swallowed — caller still gets in-memory result */
  }
}

/** All brackets, newest first. */
export function listCustomBrackets() {
  const all = readAll();
  return Object.values(all).sort(
    (a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt),
  );
}

export function getCustomBracket(id) {
  return readAll()[id] || null;
}

/**
 * Create a new bracket; returns the new id.
 *
 * `size`  is the number of books the bracket holds (4/8/16).
 * `month` is optional 0..11 — when set, the bracket is shown as
 * "January 2026" in the hub list and is intended for the user to fill
 * with that month's reads.  It's purely metadata at the storage layer.
 * `items` is optional and defaults to [] — books get added INSIDE the
 * bracket via the new add-books mode in CustomBracketView.
 */
export function createCustomBracket({ title, year, items = [], format, size = 8, month = null, presetId = null }) {
  const id   = `cb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const now  = new Date().toISOString();
  const all  = readAll();
  all[id] = {
    id, title, year, items, format, size, month, presetId,
    picks:     {},
    winner:    null,
    createdAt: now,
    updatedAt: now,
  };
  writeAll(all);
  schedulePush();
  return id;
}

/** Patch a bracket; returns the updated bracket or null if not found. */
export function updateCustomBracket(id, patch) {
  const all = readAll();
  const cur = all[id];
  if (!cur) return null;
  const next = { ...cur, ...patch, updatedAt: new Date().toISOString() };
  all[id] = next;
  writeAll(all);
  schedulePush();
  return next;
}

export function deleteCustomBracket(id) {
  const all = readAll();
  delete all[id];
  writeAll(all);
  tombstone("custom_brackets", id);
}
