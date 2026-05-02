/**
 * rankTrending.js — personalizes a list of trending items based on user preferences.
 *
 * Works for any category (books, movies, games) as long as each item has:
 *   - categories: string[]  — genre/type IDs matched against selectedCategories
 *   - tags: string[]        — mood/style IDs matched against selectedTags
 *   - popularity (or sourcePopularityScore): number — raw popularity signal
 *
 * Popularity is normalized to 0-1 within each batch before scoring, so raw
 * counts from external APIs (which can be in the thousands) don't swamp the
 * preference boost multipliers.
 *
 * Three discovery modes (set by the user during onboarding):
 *   mainstream  — popularity dominates; preference match is a small tiebreaker
 *   balanced    — popularity and preference match on comparable footing
 *   taste_first — preference match dominates; popularity is only a tiebreaker
 */

// Some "excluded" IDs from the UI don't map 1:1 to item category/tag IDs.
// e.g. the user excludes "romance_heavy" but items are tagged "romance".
const EXCLUDE_ALIASES = {
  romance_heavy: ["romance"],
  dark_violent:  ["dark_intense", "horror"],
  slow_literary: ["literary_fiction"],
};

export function rankTrending(items, prefs) {
  if (!items?.length) return items ?? [];
  if (!prefs?.personalizationEnabled) return items;

  const {
    selectedCategories = [],
    selectedTags = [],
    excludedTags = [],
    discoveryMode = "balanced",
  } = prefs.preferences || {};

  const hasFilters = selectedCategories.length || selectedTags.length || excludedTags.length;
  if (!hasFilters) return items;

  // Expand each excluded ID to include its aliases
  const expandedExcludes = [...new Set(
    excludedTags.flatMap(t => [t, ...(EXCLUDE_ALIASES[t] || [])])
  )];

  // Normalize popularity to 0-1 within this batch so raw counts
  // (which can be in the thousands) don't swamp preference boosts.
  const rawPops = items.map(i => i.sourcePopularityScore ?? i.popularity ?? 0);
  const maxPop = Math.max(...rawPops, 1);

  const scored = items.map(item => {
    const cats = item.categories || [];
    const tags = item.tags || [];
    const normPop = (item.sourcePopularityScore ?? item.popularity ?? 0) / maxPop;

    if (expandedExcludes.some(t => tags.includes(t) || cats.includes(t))) {
      return { ...item, _score: -Infinity };
    }

    const catBoost = selectedCategories.filter(c => cats.includes(c)).length;
    const tagBoost = selectedTags.filter(t => tags.includes(t)).length;
    const matchBoost = catBoost * 3 + tagBoost * 2;

    let score;
    if (discoveryMode === "mainstream") {
      // Pop dominates; match is a small tiebreaker
      score = normPop * 100 + matchBoost * 0.5;
    } else if (discoveryMode === "taste_first") {
      // Match dominates completely; pop is only a tiebreaker
      score = matchBoost * 100 + normPop;
    } else {
      // Balanced: pop and match on comparable footing
      score = normPop * 50 + matchBoost * 10;
    }

    return { ...item, _score: score };
  });

  return scored
    .filter(item => item._score !== -Infinity)
    .sort((a, b) => b._score - a._score);
}
