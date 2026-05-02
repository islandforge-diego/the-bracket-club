const KEY = "bracket_club_onboarding";

const DEFAULTS = {
  hasSeenWelcome: false,
  hasAddedFirstItem: false,
  hasStarredFirst: false,
  hasViewedBracket: false,
  hasViewedTrending: false,
};

export function getOnboarding() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setOnboarding(updates) {
  const current = getOnboarding();
  const next = { ...current, ...updates };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  return next;
}

export function resetOnboarding() {
  try { localStorage.removeItem(KEY); } catch {}
  return { ...DEFAULTS };
}
