const KEY = "bracket_club_trending_prefs";

const DEFAULT_PREFS = {
  onboardingCompleted: false,
  personalizationEnabled: false,
  preferences: {
    selectedCategories: [],
    selectedTags: [],
    excludedTags: [],
    discoveryMode: "balanced",
  },
  externalSource: null,
  resultsLastRefreshedAt: null,
};

export function getTrendingPrefs(categoryId) {
  try {
    const raw = localStorage.getItem(KEY);
    const all = raw ? JSON.parse(raw) : {};
    const saved = all[categoryId] || {};
    return {
      ...DEFAULT_PREFS,
      ...saved,
      preferences: { ...DEFAULT_PREFS.preferences, ...saved.preferences },
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function setTrendingPrefs(categoryId, updates) {
  try {
    const raw = localStorage.getItem(KEY);
    const all = raw ? JSON.parse(raw) : {};
    const saved = all[categoryId] || {};
    const next = {
      ...DEFAULT_PREFS,
      ...saved,
      ...updates,
      preferences: {
        ...DEFAULT_PREFS.preferences,
        ...saved.preferences,
        ...updates.preferences,
      },
    };
    all[categoryId] = next;
    localStorage.setItem(KEY, JSON.stringify(all));
    return next;
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function resetTrendingPrefs(categoryId) {
  try {
    const raw = localStorage.getItem(KEY);
    const all = raw ? JSON.parse(raw) : {};
    all[categoryId] = { ...DEFAULT_PREFS };
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {}
  return { ...DEFAULT_PREFS };
}

export function touchTrendingResults(categoryId) {
  return setTrendingPrefs(categoryId, { resultsLastRefreshedAt: Date.now() });
}
