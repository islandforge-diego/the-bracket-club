/**
 * bracketFormats.js — registry of bracket formats the app supports.
 *
 * Every bracket (annual + monthly) carries a `format` string from this list.
 * `single_elim` is the historical default — pairs items in their natural
 * order and runs a knockout tournament.  `seeded_by_rating` re-pairs the
 * items so #1 plays #last, #2 plays #(last-1), etc., which is what real
 * tournaments do and which the app calls "seeded by rating".
 *
 * `round_robin` and `double_elim` are listed for the picker but not yet
 * implemented — `available: false` hides their selection until B-2/B-3.
 */

export const BRACKET_FORMATS = [
  {
    id:        "single_elim",
    label:     "Single elimination",
    sub:       "Lose once, you're out — straight knockout",
    icon:      "🥊",
    available: true,
  },
  {
    id:        "round_robin",
    label:     "Round-robin",
    sub:       "Every book vs every other — most wins is champion.  Best for 4-6 books.",
    icon:      "🔁",
    available: true,
  },
];

export const DEFAULT_FORMAT = "single_elim";

export function getFormat(id) {
  return BRACKET_FORMATS.find((f) => f.id === id) ?? BRACKET_FORMATS[0];
}

/**
 * Pass-through for the seeding pipeline.  The "seeded_by_rating" format was
 * removed but legacy brackets in localStorage may still carry that format
 * id, so callers continue to call applySeeding() defensively — it just
 * returns the items unchanged.  Kept as a function so adding seeding modes
 * later is a one-line restore.
 */
export function applySeeding(items, _format) {
  return items;
}
