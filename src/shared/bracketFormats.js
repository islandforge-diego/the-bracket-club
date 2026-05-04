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
    id:          "single_elim",
    label:       "Single elimination",
    sub:         "Lose once, you're out — straight knockout",
    icon:        "🥊",
    available:   true,
  },
  {
    id:          "seeded_by_rating",
    label:       "Seeded by rating",
    sub:         "Top-rated faces lowest-rated each round — saves the dramatic finals",
    icon:        "⭐",
    available:   true,
  },
  {
    id:          "round_robin",
    label:       "Round-robin",
    sub:         "Every book vs every other — most wins is champion.  Monthly only (annual stays knockout).",
    icon:        "🔁",
    available:   true,
    monthlyOnly: true,
  },
  {
    id:          "double_elim",
    label:       "Double elimination",
    sub:         "One loss sends you to the losers bracket — second chance to win it all",
    icon:        "⚔️",
    available:   false,
  },
];

export const DEFAULT_FORMAT = "single_elim";

export function getFormat(id) {
  return BRACKET_FORMATS.find((f) => f.id === id) ?? BRACKET_FORMATS[0];
}

/**
 * Reorder items for "seeded by rating".  Highest rating gets seed 1, lowest
 * gets seed N.  Books missing a rating are treated as 0 (sort to the end).
 * Standard tournament seeding then pairs seed 1 vs N, 2 vs N-1, etc., so we
 * also return that pair order — caller can flatten as needed.
 *
 * @param {Array}  items  Items with optional `rating` (1-5) field.
 * @returns {Array}       Items reordered into seed-pair sequence:
 *                        [seed1, seedN, seed2, seedN-1, …].  If N is odd the
 *                        middle seed appears once at the end.
 */
export function applySeeding(items, format) {
  if (format !== "seeded_by_rating" || items.length < 2) return items;

  // Sort high → low by rating; stable for equal ratings (preserves input order)
  const ranked = items
    .map((item, idx) => ({ item, idx, rating: item?.rating ?? 0 }))
    .sort((a, b) => b.rating - a.rating || a.idx - b.idx)
    .map((x) => x.item);

  // Pair best-vs-worst: [r0, rN-1, r1, rN-2, ...]
  const out = [];
  let lo = 0, hi = ranked.length - 1;
  while (lo < hi) {
    out.push(ranked[lo++], ranked[hi--]);
  }
  if (lo === hi) out.push(ranked[lo]);   // odd middle seed
  return out;
}
