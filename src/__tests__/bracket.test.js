import { describe, it, expect } from 'vitest';
import { buildBracket, getBracketWinner, isMatchEmpty, getMatchItems } from '../shared/bracket.js';

const book = (id) => ({ id, title: `Book ${id}` });

describe('buildBracket', () => {
  it('returns empty rounds for fewer than 2 items', () => {
    expect(buildBracket([book('a')]).rounds).toEqual([]);
    expect(buildBracket([]).rounds).toEqual([]);
  });

  it('builds a single match for exactly 2 items', () => {
    const { rounds } = buildBracket([book('a'), book('b')]);
    expect(rounds).toHaveLength(1);
    expect(rounds[0]).toHaveLength(1);
    expect(rounds[0][0].a.id).toBe('a');
    expect(rounds[0][0].b.id).toBe('b');
    expect(rounds[0][0].c).toBeUndefined();
  });

  it('builds a triple match for exactly 3 items', () => {
    const { rounds } = buildBracket([book('a'), book('b'), book('c')]);
    expect(rounds).toHaveLength(1);
    expect(rounds[0][0].c.id).toBe('c');
  });

  it('builds two rounds for 4 items', () => {
    const items = ['a', 'b', 'c', 'd'].map(book);
    const { rounds } = buildBracket(items);
    expect(rounds).toHaveLength(2);
    expect(rounds[0]).toHaveLength(2);
    expect(rounds[1]).toHaveLength(1);
  });

  it('round 2+ matches reference round 1 match IDs via feedA/feedB', () => {
    const items = ['a', 'b', 'c', 'd'].map(book);
    const { rounds } = buildBracket(items);
    const final = rounds[1][0];
    expect(final.feedA).toBe(rounds[0][0].id);
    expect(final.feedB).toBe(rounds[0][1].id);
  });

  it('builds correct structure for 12 items (standard trending bracket)', () => {
    const items = Array.from({ length: 12 }, (_, i) => book(String(i)));
    const { rounds } = buildBracket(items);
    // 12 items → 6 matches round 1 → 3 matches round 2 → 2 matches round 3 → 1 final
    expect(rounds[0]).toHaveLength(6);
    expect(rounds[rounds.length - 1]).toHaveLength(1);
  });

  it('all match IDs are unique', () => {
    const items = Array.from({ length: 8 }, (_, i) => book(String(i)));
    const { rounds } = buildBracket(items);
    const ids = rounds.flat().map(m => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('getBracketWinner', () => {
  it('returns the pick for a match', () => {
    const b = book('a');
    expect(getBracketWinner('r1_0', [], { r1_0: b })).toBe(b);
  });

  it('returns null when no pick exists', () => {
    expect(getBracketWinner('r1_0', [], {})).toBeNull();
  });
});

describe('isMatchEmpty', () => {
  it('returns true for unknown match ID', () => {
    const { rounds } = buildBracket([book('a'), book('b')]);
    expect(isMatchEmpty('nonexistent', rounds)).toBe(true);
  });

  it('returns false for a seeded match that has items', () => {
    const { rounds } = buildBracket([book('a'), book('b')]);
    expect(isMatchEmpty('r1_0', rounds)).toBe(false);
  });
});

describe('getMatchItems', () => {
  it('returns winners from months for a direct month match', () => {
    const w1 = book('winner1');
    const w2 = book('winner2');
    const months = [{ winner: w1 }, { winner: w2 }];
    const match = { m1: 0, m2: 1 };
    const result = getMatchItems(match, months, {}, []);
    expect(result.b1).toBe(w1);
    expect(result.b2).toBe(w2);
  });

  it('returns null for months with no winner', () => {
    const months = [{ winner: null }, { winner: null }];
    const match = { m1: 0, m2: 1 };
    const result = getMatchItems(match, months, {}, []);
    expect(result.b1).toBeNull();
    expect(result.b2).toBeNull();
  });
});
