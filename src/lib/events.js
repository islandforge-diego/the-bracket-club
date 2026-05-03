/**
 * events.js — fire-and-forget client-side event tracker.
 *
 * Writes to the `events` table (see migration 006). RLS guarantees a user
 * can only write events for themselves, so the worst-case impact of a bug
 * here is missed analytics — never wrong attribution.
 *
 * Calls are intentionally non-blocking. Tracking failures log a warning
 * but never surface to the UI; the app should always feel responsive even
 * if Supabase is slow or offline.
 *
 * Usage:
 *   import { track } from "./lib/events.js";
 *   track(user.id, "book_added", { slot: 0, year: 2026, source: "search" });
 *
 * Standard event types (keep this list as the source of truth):
 *   sign_in          — user authenticated, one per session start
 *   book_added       — book added to a slot
 *   book_removed     — book removed from a slot
 *   winner_crowned   — month/slot winner picked
 *   bracket_pick     — annual-bracket vote cast
 *   season_champion  — season champion crowned
 */

import { supabase } from "./supabase.js";

export const EVENT = {
  SIGN_IN:          "sign_in",
  BOOK_ADDED:       "book_added",
  BOOK_REMOVED:     "book_removed",
  WINNER_CROWNED:   "winner_crowned",
  BRACKET_PICK:     "bracket_pick",
  SEASON_CHAMPION:  "season_champion",
};

export function track(userId, eventType, properties = {}) {
  if (!supabase || !userId || !eventType) return;
  // Fire-and-forget: never await this, never throw to caller.
  supabase
    .from("events")
    .insert({ user_id: userId, event_type: eventType, properties })
    .then(({ error }) => {
      if (error) console.warn(`[events] track(${eventType}) failed:`, error.message);
    });
}
