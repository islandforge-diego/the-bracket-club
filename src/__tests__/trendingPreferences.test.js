import { describe, it, expect, beforeEach } from 'vitest';
import { getTrendingPrefs, setTrendingPrefs, resetTrendingPrefs } from '../shared/trendingPreferences.js';

beforeEach(() => {
  localStorage.clear();
});

const DEFAULT = {
  onboardingCompleted: false,
  personalizationEnabled: false,
  preferences: {
    selectedCategories: [],
    selectedTags: [],
    excludedTags: [],
    discoveryMode: 'balanced',
  },
  externalSource: null,
  resultsLastRefreshedAt: null,
};

describe('getTrendingPrefs', () => {
  it('returns full defaults for a new category', () => {
    const result = getTrendingPrefs('books');
    expect(result).toEqual(DEFAULT);
  });

  it('returns defaults for a different category that has not been set', () => {
    setTrendingPrefs('movies', { onboardingCompleted: true });
    expect(getTrendingPrefs('books')).toEqual(DEFAULT);
  });

  it('merges saved top-level fields with defaults', () => {
    setTrendingPrefs('books', { onboardingCompleted: true, personalizationEnabled: true });
    const result = getTrendingPrefs('books');
    expect(result.onboardingCompleted).toBe(true);
    expect(result.personalizationEnabled).toBe(true);
    expect(result.preferences).toEqual(DEFAULT.preferences);
  });

  it('merges saved nested preferences with defaults', () => {
    setTrendingPrefs('books', { preferences: { selectedCategories: ['fantasy'] } });
    const result = getTrendingPrefs('books');
    expect(result.preferences.selectedCategories).toEqual(['fantasy']);
    expect(result.preferences.discoveryMode).toBe('balanced');
  });
});

describe('setTrendingPrefs', () => {
  it('returns the merged result', () => {
    const result = setTrendingPrefs('books', { onboardingCompleted: true });
    expect(result.onboardingCompleted).toBe(true);
  });

  it('persists to localStorage so subsequent getTrendingPrefs reads it', () => {
    setTrendingPrefs('books', { onboardingCompleted: true, personalizationEnabled: true });
    expect(getTrendingPrefs('books').onboardingCompleted).toBe(true);
  });

  it('does not overwrite other categories', () => {
    setTrendingPrefs('movies', { onboardingCompleted: true });
    setTrendingPrefs('books', { onboardingCompleted: false });
    expect(getTrendingPrefs('movies').onboardingCompleted).toBe(true);
  });

  it('deep-merges preferences without wiping unset fields', () => {
    setTrendingPrefs('books', { preferences: { selectedCategories: ['fantasy'] } });
    setTrendingPrefs('books', { preferences: { discoveryMode: 'mainstream' } });
    const result = getTrendingPrefs('books');
    expect(result.preferences.selectedCategories).toEqual(['fantasy']);
    expect(result.preferences.discoveryMode).toBe('mainstream');
  });
});

describe('resetTrendingPrefs', () => {
  it('returns defaults', () => {
    setTrendingPrefs('books', { onboardingCompleted: true, personalizationEnabled: true });
    const result = resetTrendingPrefs('books');
    expect(result).toEqual(DEFAULT);
  });

  it('subsequent getTrendingPrefs returns defaults after reset', () => {
    setTrendingPrefs('books', { onboardingCompleted: true });
    resetTrendingPrefs('books');
    expect(getTrendingPrefs('books')).toEqual(DEFAULT);
  });

  it('does not reset other categories', () => {
    setTrendingPrefs('books', { onboardingCompleted: true });
    setTrendingPrefs('movies', { onboardingCompleted: true });
    resetTrendingPrefs('books');
    expect(getTrendingPrefs('movies').onboardingCompleted).toBe(true);
  });
});
