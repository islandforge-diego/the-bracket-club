import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseCSVLine,
  parseGoodreadsCSV,
  parseGoodreadsRSSAll,
  parseGoodreadsRSS,
  parseTrendingBooksHTML,
  enrichBooks,
} from '../categories/books/data.js';

// ─── CSV Parsing ──────────────────────────────────────────────────────────────

describe('parseCSVLine', () => {
  it('parses plain comma-separated values', () => {
    expect(parseCSVLine('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('handles quoted fields containing commas', () => {
    expect(parseCSVLine('"hello, world",b')).toEqual(['hello, world', 'b']);
  });

  it('handles escaped double quotes inside quoted fields', () => {
    expect(parseCSVLine('"say ""hi""",b')).toEqual(['say "hi"', 'b']);
  });

  it('handles empty fields', () => {
    expect(parseCSVLine('a,,c')).toEqual(['a', '', 'c']);
  });

  it('returns single value for no commas', () => {
    expect(parseCSVLine('hello')).toEqual(['hello']);
  });
});

describe('parseGoodreadsCSV', () => {
  const makeCSV = (rows) => {
    const header = 'Book Id,Title,Author,My Rating,Exclusive Shelf,Date Read';
    const lines = rows.map(r =>
      `${r.id},"${r.title}","${r.author}",${r.rating},${r.shelf},${r.dateRead}`
    );
    return [header, ...lines].join('\n');
  };

  it('parses a read book in the target year', () => {
    const csv = makeCSV([{ id: 1, title: 'Dune', author: 'Herbert', rating: 5, shelf: 'read', dateRead: '2025/01/15' }]);
    const result = parseGoodreadsCSV(csv, 2025);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Dune');
    expect(result[0].rating).toBe(5);
    expect(result[0].month).toBe(0); // January = 0
  });

  it('excludes books from a different year', () => {
    const csv = makeCSV([{ id: 1, title: 'Old Book', author: 'A', rating: 4, shelf: 'read', dateRead: '2024/06/01' }]);
    expect(parseGoodreadsCSV(csv, 2025)).toHaveLength(0);
  });

  it('excludes books not on the read shelf', () => {
    const csv = makeCSV([{ id: 1, title: 'Unread', author: 'A', rating: 0, shelf: 'to-read', dateRead: '2025/03/01' }]);
    expect(parseGoodreadsCSV(csv, 2025)).toHaveLength(0);
  });

  it('excludes books with a missing or malformed date', () => {
    const csv = makeCSV([{ id: 1, title: 'No Date', author: 'A', rating: 3, shelf: 'read', dateRead: '' }]);
    expect(parseGoodreadsCSV(csv, 2025)).toHaveLength(0);
  });

  it('sets rating to null for out-of-range values', () => {
    const csv = makeCSV([{ id: 1, title: 'Book', author: 'A', rating: 0, shelf: 'read', dateRead: '2025/05/01' }]);
    expect(parseGoodreadsCSV(csv, 2025)[0].rating).toBeNull();
  });

  it('returns empty array for CSV with only a header', () => {
    expect(parseGoodreadsCSV('Book Id,Title', 2025)).toHaveLength(0);
  });
});

// ─── RSS Parsing ──────────────────────────────────────────────────────────────

const makeRSS = (items) => `<?xml version="1.0"?>
<rss><channel>${items.map(item => `
  <item>
    <title>${item.title}</title>
    <author_name>${item.author}</author_name>
    <user_read_at>${item.readAt}</user_read_at>
    <user_rating>${item.rating}</user_rating>
    <book_large_image_url>${item.cover || ''}</book_large_image_url>
    <book_description>${item.desc || ''}</book_description>
  </item>`).join('')}
</channel></rss>`;

describe('parseGoodreadsRSSAll', () => {
  it('extracts title, author, rating, month, year from an RSS item', () => {
    const xml = makeRSS([{ title: 'Dune', author: 'Herbert', readAt: 'Sat, 15 Jan 2025 00:00:00 +0000', rating: '5' }]);
    const result = parseGoodreadsRSSAll(xml);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Dune');
    expect(result[0].author).toBe('Herbert');
    expect(result[0].rating).toBe(5);
    expect(result[0].year).toBe(2025);
    expect(result[0].month).toBe(0);
  });

  it('skips items with no user_read_at', () => {
    const xml = makeRSS([{ title: 'No Date', author: 'A', readAt: '', rating: '4' }]);
    expect(parseGoodreadsRSSAll(xml)).toHaveLength(0);
  });

  it('skips items with an invalid date', () => {
    const xml = makeRSS([{ title: 'Bad Date', author: 'A', readAt: 'not-a-date', rating: '3' }]);
    expect(parseGoodreadsRSSAll(xml)).toHaveLength(0);
  });

  it('strips HTML tags from description', () => {
    const xml = makeRSS([{ title: 'X', author: 'Y', readAt: 'Mon, 01 Mar 2025 00:00:00 +0000', rating: '4', desc: '<p>Great <b>book</b></p>' }]);
    expect(parseGoodreadsRSSAll(xml)[0].description).toBe('Great book');
  });

  it('sets rating to null for zero or out-of-range values', () => {
    const xml = makeRSS([{ title: 'X', author: 'Y', readAt: 'Mon, 01 Mar 2025 00:00:00 +0000', rating: '0' }]);
    expect(parseGoodreadsRSSAll(xml)[0].rating).toBeNull();
  });

  it('excludes cover URL when it contains "nophoto"', () => {
    const xml = makeRSS([{ title: 'X', author: 'Y', readAt: 'Mon, 01 Mar 2025 00:00:00 +0000', rating: '3', cover: 'https://gr.com/nophoto.jpg' }]);
    expect(parseGoodreadsRSSAll(xml)[0].cover).toBe('');
  });
});

describe('parseGoodreadsRSS', () => {
  it('filters books to the target year only', () => {
    const xml = makeRSS([
      { title: 'This Year', author: 'A', readAt: 'Sat, 15 Jan 2025 00:00:00 +0000', rating: '4' },
      { title: 'Last Year', author: 'B', readAt: 'Mon, 10 Jun 2024 00:00:00 +0000', rating: '3' },
    ]);
    const result = parseGoodreadsRSS(xml, 2025);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('This Year');
  });
});

// ─── Trending HTML Parsing ────────────────────────────────────────────────────

function makeNextData(edges) {
  const apollo = { ROOT_QUERY: {} };
  apollo.ROOT_QUERY['getTopList({"id":"123"})'] = {
    edges: edges.map((e, i) => ({
      count: e.count ?? 100,
      node: { __ref: `Book:${i}` },
    })),
  };
  edges.forEach((e, i) => {
    apollo[`Book:${i}`] = {
      legacyId: String(i + 1),
      title: e.title,
      titleComplete: e.title,
      imageUrl: e.cover || '',
      description: e.description || '',
      primaryContributorEdge: { node: { __ref: `Author:${i}` } },
      work: { __ref: `Work:${i}` },
    };
    apollo[`Author:${i}`] = { name: e.author };
    apollo[`Work:${i}`] = { stats: { averageRating: e.rating ?? 4.0, ratingsCount: 1000 } };
  });
  const json = JSON.stringify({ props: { pageProps: { apolloState: apollo } } });
  return `<html><script id="__NEXT_DATA__" type="application/json">${json}</script></html>`;
}

describe('parseTrendingBooksHTML', () => {
  it('extracts book data from __NEXT_DATA__', () => {
    const html = makeNextData([{ title: 'Intermezzo', author: 'Sally Rooney', count: 500 }]);
    const result = parseTrendingBooksHTML(html);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Intermezzo');
    expect(result[0].author).toBe('Sally Rooney');
    expect(result[0].popularity).toBe(500);
  });

  it('returns empty array when no __NEXT_DATA__ script found', () => {
    expect(parseTrendingBooksHTML('<html><body>nothing</body></html>')).toEqual([]);
  });

  it('returns empty array when apolloState is missing', () => {
    const html = `<script id="__NEXT_DATA__">${JSON.stringify({ props: {} })}</script>`;
    expect(parseTrendingBooksHTML(html)).toEqual([]);
  });

  it('respects the limit parameter', () => {
    const edges = Array.from({ length: 20 }, (_, i) => ({ title: `Book ${i}`, author: 'A' }));
    const html = makeNextData(edges);
    expect(parseTrendingBooksHTML(html, 5)).toHaveLength(5);
    expect(parseTrendingBooksHTML(html, 20)).toHaveLength(20);
  });

  it('defaults to limit of 12', () => {
    const edges = Array.from({ length: 20 }, (_, i) => ({ title: `Book ${i}`, author: 'A' }));
    expect(parseTrendingBooksHTML(makeNextData(edges))).toHaveLength(12);
  });

  it('strips HTML from description', () => {
    const html = makeNextData([{ title: 'X', author: 'Y', description: '<p>Great <b>book</b></p>' }]);
    expect(parseTrendingBooksHTML(html)[0].description).toBe('Great book');
  });
});

// ─── enrichBooks ─────────────────────────────────────────────────────────────

describe('enrichBooks', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const olResponse = (subjects) =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({ docs: [{ subject: subjects }] }) });

  it('skips books that already have a categories array', async () => {
    const book = { id: '1', title: 'Dune', author: 'Herbert', categories: ['sci_fi'], tags: [] };
    const result = await enrichBooks([book]);
    expect(fetch).not.toHaveBeenCalled();
    expect(result[0]).toBe(book);
  });

  it('fetches Open Library subjects for unenriched books', async () => {
    fetch.mockReturnValue(olResponse([]));
    await enrichBooks([{ id: '1', title: 'Dune', author: 'Herbert', description: '' }]);
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][0]).toContain('openlibrary.org');
  });

  it('maps fantasy subjects to the fantasy category', async () => {
    fetch.mockReturnValue(olResponse(['Fantasy fiction', 'Magic']));
    const result = await enrichBooks([{ id: '1', title: 'X', author: 'Y', description: '' }]);
    expect(result[0].categories).toContain('fantasy');
  });

  it('maps biography subjects to memoir_biography category', async () => {
    fetch.mockReturnValue(olResponse(['Biography & Autobiography', 'Memoir']));
    const result = await enrichBooks([{ id: '1', title: 'X', author: 'Y', description: '' }]);
    expect(result[0].categories).toContain('memoir_biography');
  });

  it('infers page_turners tag from description keywords', async () => {
    fetch.mockReturnValue(olResponse([]));
    const result = await enrichBooks([{ id: '1', title: 'X', author: 'Y', description: 'A gripping, fast-paced thriller.' }]);
    expect(result[0].tags).toContain('page_turners');
  });

  it('infers award_winning tag from description keywords', async () => {
    fetch.mockReturnValue(olResponse([]));
    const result = await enrichBooks([{ id: '1', title: 'X', author: 'Y', description: 'A Pulitzer Prize winning novel.' }]);
    expect(result[0].tags).toContain('award_winning');
  });

  it('sets categories and tags to empty arrays on fetch failure', async () => {
    fetch.mockRejectedValue(new Error('network error'));
    const result = await enrichBooks([{ id: '1', title: 'X', author: 'Y', description: '' }]);
    expect(result[0].categories).toEqual([]);
    expect(result[0].tags).toEqual([]);
  });

  it('enriches multiple books in parallel', async () => {
    fetch.mockReturnValue(olResponse([]));
    const books = [
      { id: '1', title: 'A', author: 'X', description: '' },
      { id: '2', title: 'B', author: 'Y', description: '' },
    ];
    const result = await enrichBooks(books);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(2);
  });
});
