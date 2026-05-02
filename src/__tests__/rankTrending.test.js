import { describe, it, expect } from 'vitest';
import { rankTrending } from '../shared/rankTrending.js';

const book = (id, cats = [], tags = [], pop = 100) => ({
  id, title: `Book ${id}`, categories: cats, tags, popularity: pop,
});

const prefs = (overrides = {}) => ({
  personalizationEnabled: true,
  preferences: {
    selectedCategories: [],
    selectedTags: [],
    excludedTags: [],
    discoveryMode: 'balanced',
    ...overrides,
  },
});

describe('rankTrending', () => {
  it('returns items unchanged when personalizationEnabled is false', () => {
    const items = [book('a'), book('b')];
    const result = rankTrending(items, { personalizationEnabled: false });
    expect(result).toEqual(items);
  });

  it('returns items unchanged when no filters are set', () => {
    const items = [book('a'), book('b')];
    const result = rankTrending(items, prefs());
    expect(result.map(b => b.id)).toEqual(['a', 'b']);
  });

  it('returns empty array for empty input', () => {
    expect(rankTrending([], prefs())).toEqual([]);
  });

  it('returns empty array for null input', () => {
    expect(rankTrending(null, prefs())).toEqual([]);
  });

  it('boosts books matching selectedCategories to the top', () => {
    // Same popularity — category match should win in balanced mode
    const items = [
      book('no-match', ['romance'], [], 100),
      book('match', ['fantasy'], [], 100),
    ];
    const result = rankTrending(items, prefs({ selectedCategories: ['fantasy'] }));
    expect(result[0].id).toBe('match');
  });

  it('boosts books matching selectedTags to the top', () => {
    // Same popularity — tag match should win in balanced mode
    const items = [
      book('no-match', [], [], 100),
      book('match', [], ['page_turners'], 100),
    ];
    const result = rankTrending(items, prefs({ selectedTags: ['page_turners'] }));
    expect(result[0].id).toBe('match');
  });

  it('excludes books matching excludedTags', () => {
    const items = [
      book('keep', ['fantasy']),
      book('drop', ['horror']),
    ];
    const result = rankTrending(items, prefs({ excludedTags: ['horror'] }));
    expect(result.map(b => b.id)).toEqual(['keep']);
  });

  it('handles romance_heavy alias — excludes books with romance category', () => {
    const items = [
      book('keep', ['fantasy']),
      book('drop', ['romance']),
    ];
    const result = rankTrending(items, prefs({ excludedTags: ['romance_heavy'] }));
    expect(result.map(b => b.id)).toEqual(['keep']);
  });

  it('handles dark_violent alias — excludes horror and dark_intense', () => {
    const items = [
      book('keep', ['fantasy']),
      book('drop-horror', ['horror']),
      book('drop-dark', [], ['dark_intense']),
    ];
    const result = rankTrending(items, prefs({ excludedTags: ['dark_violent'] }));
    expect(result.map(b => b.id)).toEqual(['keep']);
  });

  it('handles slow_literary alias — excludes literary_fiction', () => {
    const items = [
      book('keep', ['fantasy']),
      book('drop', ['literary_fiction']),
    ];
    const result = rankTrending(items, prefs({ excludedTags: ['slow_literary'] }));
    expect(result.map(b => b.id)).toEqual(['keep']);
  });

  it('mainstream mode ranks primarily by popularity', () => {
    const items = [
      book('low-pop-match', ['fantasy'], [], 10),
      book('high-pop-no-match', ['romance'], [], 1000),
    ];
    const result = rankTrending(items, prefs({
      selectedCategories: ['fantasy'],
      discoveryMode: 'mainstream',
    }));
    expect(result[0].id).toBe('high-pop-no-match');
  });

  it('taste_first mode ranks matching books above high-popularity non-matches', () => {
    const items = [
      book('low-pop-match', ['fantasy'], [], 10),
      book('high-pop-no-match', ['romance'], [], 1000),
    ];
    const result = rankTrending(items, prefs({
      selectedCategories: ['fantasy'],
      discoveryMode: 'taste_first',
    }));
    expect(result[0].id).toBe('low-pop-match');
  });

  it('balanced mode blends popularity and match score', () => {
    const items = [
      book('match', ['business'], [], 50),
      book('popular', [], [], 500),
    ];
    const result = rankTrending(items, prefs({
      selectedCategories: ['business'],
      discoveryMode: 'balanced',
    }));
    // match gets catBoost*3=9 + pop*0.5=25 = 34; popular gets 0 + 250 = 250
    // popular wins in balanced mode when popularity gap is very large
    expect(result[0].id).toBe('popular');
  });

  it('multiple category matches accumulate boost', () => {
    const items = [
      book('single-match', ['fantasy'], [], 100),
      book('double-match', ['fantasy', 'sci_fi'], [], 100),
    ];
    const result = rankTrending(items, prefs({
      selectedCategories: ['fantasy', 'sci_fi'],
      discoveryMode: 'taste_first',
    }));
    expect(result[0].id).toBe('double-match');
  });

  it('preserves all non-excluded books', () => {
    const items = [book('a'), book('b'), book('c')];
    const result = rankTrending(items, prefs({ selectedCategories: ['fantasy'] }));
    expect(result).toHaveLength(3);
  });
});
