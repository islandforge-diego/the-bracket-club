import { describe, it, expect, beforeEach } from 'vitest';
import { load, save, clear, newId } from '../logo-board/storage.js';

describe('logo-board/storage', () => {
  beforeEach(() => { localStorage.clear(); });

  it('returns null when nothing saved', () => {
    expect(load()).toBe(null);
  });

  it('round-trips items through save/load', () => {
    const items = [{ id: 'a', type: 'image', src: 'x', x: 1, y: 2, w: 3, h: 4 }];
    save({ items });
    expect(load()).toEqual({ items });
  });

  it('returns null on malformed payload', () => {
    localStorage.setItem('logoBoard.v1', '{not json');
    expect(load()).toBe(null);
  });

  it('returns null when items field is missing', () => {
    localStorage.setItem('logoBoard.v1', JSON.stringify({ foo: 1 }));
    expect(load()).toBe(null);
  });

  it('clear() removes saved state', () => {
    save({ items: [{ id: 'a' }] });
    clear();
    expect(load()).toBe(null);
  });

  it('newId() returns unique-ish strings', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newId()));
    expect(ids.size).toBe(50);
  });
});
