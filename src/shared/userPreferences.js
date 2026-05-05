/**
 * userPreferences.js — what genres / categories the user told us they like.
 *
 * Stored in localStorage at bc_user_prefs.  Used today by BracketHub to
 * surface community brackets that match the user's taste; future features
 * (recommendations, sound moods, etc.) can read the same store.
 *
 * Genre IDs are stable strings — they match what community brackets tag
 * themselves with via `genres: [...]` so set-intersection is the matching
 * algorithm.
 */

import { schedulePush } from "./cloudSync.js";

const STORAGE_KEY = "bc_user_prefs";

export const GENRE_OPTIONS = [
  { id: "fantasy",         label: "Fantasy",          icon: "🐉" },
  { id: "scifi",           label: "Sci-Fi",           icon: "🚀" },
  { id: "horror",          label: "Horror",           icon: "💀" },
  { id: "mystery",         label: "Mystery / Thriller", icon: "🔍" },
  { id: "romance",         label: "Romance",          icon: "💕" },
  { id: "literary",        label: "Literary Fiction", icon: "📚" },
  { id: "ya",              label: "Young Adult",      icon: "🦄" },
  { id: "non_fiction",     label: "Non-Fiction",      icon: "🧠" },
  { id: "classics",        label: "Classics",         icon: "🏛️" },
  { id: "memoir",          label: "Memoir / Bio",     icon: "👤" },
];

const DEFAULT = { genres: [], onboardedAt: null };

export function getPrefs() {
  if (typeof window === "undefined") return DEFAULT;
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export function setPrefs(patch) {
  if (typeof window === "undefined") return;
  const cur = getPrefs();
  const next = { ...cur, ...patch, updatedAt: new Date().toISOString() };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  schedulePush();
  return next;
}

/** Has the user gone through the genre quiz at least once? */
export function hasOnboardedGenres() {
  const p = getPrefs();
  return !!(p.onboardedAt);
}

/**
 * Score a community bracket against the user's chosen genres.  Higher score =
 * better match.  Brackets with no genre tags fall back to a small constant
 * so they still appear (just lower priority).
 *
 * @param {Object} bracket  Community bracket with .genres[]
 * @returns {number}        0..N where N = bracket.genres.length
 */
export function scoreForUser(bracket, userGenres = null) {
  const prefs = userGenres || getPrefs().genres || [];
  if (!prefs.length) return 1;                  // no prefs → equal weight
  if (!bracket.genres?.length) return 0.5;      // un-tagged → low priority
  let score = 0;
  for (const g of bracket.genres) {
    if (prefs.includes(g)) score++;
  }
  return score;
}
