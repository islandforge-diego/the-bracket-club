/**
 * personalization.test.js
 *
 * End-to-end tests for the full personalization pipeline:
 * enrichBooks → rankTrending → filtered/ordered results.
 *
 * These tests verify the user-facing behavior: that selecting a genre preference
 * actually affects which books surface, and that "avoid" selections genuinely
 * remove those books from the list.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { enrichBooks } from '../categories/books/data.js';
import { rankTrending } from '../shared/rankTrending.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const olResponse = (subjects) =>
  Promise.resolve({ ok: true, json: () => Promise.resolve({ docs: [{ subject: subjects }] }) });

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

beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
afterEach(() => { vi.unstubAllGlobals(); });

// ─── Category detection via Open Library subjects ─────────────────────────────

describe('enrichBooks — category detection via Open Library', () => {
  it('detects romance from "romance" subject', async () => {
    fetch.mockReturnValue(olResponse(['Romance fiction', 'Fiction']));
    const [result] = await enrichBooks([{ id: '1', title: 'X', author: 'Y', description: '' }]);
    expect(result.categories).toContain('romance');
  });

  it('detects romance from "man-woman relationships" subject', async () => {
    fetch.mockReturnValue(olResponse(['Man-woman relationships', 'Fiction']));
    const [result] = await enrichBooks([{ id: '1', title: 'X', author: 'Y', description: '' }]);
    expect(result.categories).toContain('romance');
  });

  it('detects romance from "love stories" subject', async () => {
    fetch.mockReturnValue(olResponse(['Love stories', 'American fiction']));
    const [result] = await enrichBooks([{ id: '1', title: 'X', author: 'Y', description: '' }]);
    expect(result.categories).toContain('romance');
  });

  it('detects business from "entrepreneurship" subject', async () => {
    fetch.mockReturnValue(olResponse(['Entrepreneurship', 'Business']));
    const [result] = await enrichBooks([{ id: '1', title: 'X', author: 'Y', description: '' }]);
    expect(result.categories).toContain('business');
  });

  it('detects young_adult from "juvenile fiction" subject', async () => {
    fetch.mockReturnValue(olResponse(['Juvenile fiction', 'Adventure']));
    const [result] = await enrichBooks([{ id: '1', title: 'X', author: 'Y', description: '' }]);
    expect(result.categories).toContain('young_adult');
  });
});

// ─── Category detection via description fallback ──────────────────────────────

describe('enrichBooks — category detection via description (fallback when OL subjects are generic)', () => {
  it('detects romance from "enemies to lovers" in description', async () => {
    fetch.mockReturnValue(olResponse(['Fiction'])); // generic OL subject
    const [result] = await enrichBooks([{
      id: '1', title: 'X', author: 'Y',
      description: 'An enemies to lovers story about two rivals who fall in love.',
    }]);
    expect(result.categories).toContain('romance');
  });

  it('detects romance from "fall in love" in description', async () => {
    fetch.mockReturnValue(olResponse(['Fiction']));
    const [result] = await enrichBooks([{
      id: '1', title: 'X', author: 'Y',
      description: 'When they meet, they slowly fall in love.',
    }]);
    expect(result.categories).toContain('romance');
  });

  it('detects romance from "sweeping romance" in description', async () => {
    fetch.mockReturnValue(olResponse(['American fiction']));
    const [result] = await enrichBooks([{
      id: '1', title: 'X', author: 'Y',
      description: 'A sweeping romance set against the backdrop of war.',
    }]);
    expect(result.categories).toContain('romance');
  });

  it('detects business from "startup founder" in description', async () => {
    fetch.mockReturnValue(olResponse(['Fiction']));
    const [result] = await enrichBooks([{
      id: '1', title: 'X', author: 'Y',
      description: 'The true story of a startup founder who built a billion-dollar company.',
    }]);
    expect(result.categories).toContain('business');
  });

  it('detects business from "ceo" in description', async () => {
    fetch.mockReturnValue(olResponse(['Biography']));
    const [result] = await enrichBooks([{
      id: '1', title: 'X', author: 'Y',
      description: 'How this CEO transformed corporate strategy across a decade.',
    }]);
    expect(result.categories).toContain('business');
  });

  it('combines subjects and description without duplicates', async () => {
    fetch.mockReturnValue(olResponse(['Romance fiction']));
    const [result] = await enrichBooks([{
      id: '1', title: 'X', author: 'Y',
      description: 'A sweeping romance between two rivals.',
    }]);
    expect(result.categories.filter(c => c === 'romance')).toHaveLength(1);
  });

  it('does not false-positive business from a generic description', async () => {
    fetch.mockReturnValue(olResponse(['Fantasy fiction']));
    const [result] = await enrichBooks([{
      id: '1', title: 'X', author: 'Y',
      description: 'A wizard sets out on a great quest to defeat the dark lord.',
    }]);
    expect(result.categories).not.toContain('business');
    expect(result.categories).toContain('fantasy');
  });
});

// ─── Full pipeline: enrich → rank → exclude ──────────────────────────────────

describe('full personalization pipeline', () => {
  it('excludes a romance book when romance_heavy is in excludedTags', async () => {
    // Simulate a romance book with generic OL subjects (the real-world failing case)
    fetch.mockImplementation((url) => {
      if (url.includes('Intermezzo')) return olResponse(['Fiction', 'Man-woman relationships']);
      return olResponse([]);
    });

    const books = [
      { id: '1', title: 'Intermezzo', author: 'Sally Rooney', description: 'A sweeping romance about two brothers who fall in love.' },
      { id: '2', title: 'Atomic Habits', author: 'James Clear', description: 'A proven framework for building good habits.' },
    ];

    const enriched = await enrichBooks(books);
    const ranked = rankTrending(enriched, prefs({ excludedTags: ['romance_heavy'] }));

    expect(ranked.map(b => b.id)).not.toContain('1');
    expect(ranked.map(b => b.id)).toContain('2');
  });

  it('surfaces a business book when business is selected', async () => {
    fetch.mockImplementation((url) => {
      if (url.includes('Atomic')) return olResponse(['Business', 'Self-help']);
      return olResponse(['Romance fiction']);
    });

    const books = [
      { id: '1', title: 'Some Romance', author: 'A', description: 'They fall in love.', popularity: 1000 },
      { id: '2', title: 'Atomic Habits', author: 'James Clear', description: 'Build better habits.', popularity: 200 },
    ];

    const enriched = await enrichBooks(books);
    const ranked = rankTrending(enriched, prefs({
      selectedCategories: ['business'],
      discoveryMode: 'taste_first',
    }));

    expect(ranked[0].id).toBe('2');
  });

  it('excludes young_adult books when young_adult is in excludedTags', async () => {
    // Each book gets a different OL response based on call order
    fetch
      .mockReturnValueOnce(olResponse(['Juvenile fiction', 'Young adult fiction']))
      .mockReturnValueOnce(olResponse(['Literary fiction']));

    const books = [
      { id: '1', title: 'YA Book', author: 'A', description: 'A teen discovers her powers.', popularity: 500 },
      { id: '2', title: 'Literary Novel', author: 'B', description: 'A complex meditation on grief.', popularity: 100 },
    ];

    const enriched = await enrichBooks(books);
    const ranked = rankTrending(enriched, prefs({ excludedTags: ['young_adult'] }));

    expect(ranked.map(b => b.id)).not.toContain('1');
    expect(ranked.map(b => b.id)).toContain('2');
  });

  it('marks books _enriched so they are not re-fetched on next load', async () => {
    fetch.mockReturnValue(olResponse(['Fantasy fiction']));
    const [enriched] = await enrichBooks([{ id: '1', title: 'X', author: 'Y', description: '' }]);
    expect(enriched._enriched).toBe(true);

    // Second pass — should not call fetch again
    fetch.mockClear();
    await enrichBooks([enriched]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('retries enrichment for books with empty categories (prior failed lookup)', async () => {
    fetch.mockReturnValue(olResponse(['Romance fiction']));
    const staleBook = { id: '1', title: 'X', author: 'Y', description: '', categories: [], tags: [] };
    const [result] = await enrichBooks([staleBook]);
    expect(fetch).toHaveBeenCalledOnce();
    expect(result.categories).toContain('romance');
    expect(result._enriched).toBe(true);
  });
});
