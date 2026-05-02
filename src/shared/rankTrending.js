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

  const scored = items.map(item => {
    const cats = item.categories || [];
    const tags = item.tags || [];
    const pop = item.sourcePopularityScore ?? item.popularity ?? 0;

    if (excludedTags.some(t => tags.includes(t) || cats.includes(t))) {
      return { ...item, _score: -Infinity };
    }

    const catBoost = selectedCategories.filter(c => cats.includes(c)).length;
    const tagBoost = selectedTags.filter(t => tags.includes(t)).length;
    const matchBoost = catBoost * 3 + tagBoost * 2;

    let score;
    if (discoveryMode === "mainstream") {
      score = pop + matchBoost * 0.5;
    } else if (discoveryMode === "taste_first") {
      score = matchBoost * 10 + pop * 0.1;
    } else {
      score = pop * 0.5 + matchBoost * 3;
    }

    return { ...item, _score: score };
  });

  return scored
    .filter(item => item._score !== -Infinity)
    .sort((a, b) => b._score - a._score);
}
