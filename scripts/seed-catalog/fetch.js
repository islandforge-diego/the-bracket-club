/**
 * fetch.js — Build a catalog of ~300 books and write it to data.json.
 *
 * Steps:
 *  1. For each (category × decade), query Open Library sorted by editions.
 *  2. Filter out public-domain author noise and missing covers.
 *  3. Add the curated 2025-2030 future list.
 *  4. Enrich every entry via Google Books to get description + reliable cover.
 *  5. Dedupe across categories by ISBN-13 → keep first match.
 *  6. Write data.json (ready to insert by insert.js).
 *
 * Run with:  node scripts/seed-catalog/fetch.js
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CATEGORIES, DECADES, PD_AUTHOR_BLOCKLIST } from "./categories.js";
import { CURATED_FUTURE } from "./curated-future.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH  = path.join(__dirname, "data.json");

const GOOGLE_KEY = process.env.GOOGLE_BOOKS_API_KEY || "";

// Throttle so we don't hammer either API.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Open Library ─────────────────────────────────────────────────────────────
async function fetchOpenLibrary(subject, startYear, endYear, limit) {
  // language:eng filters to predominantly English editions; sort=editions
  // ranks by reprint count (Open Library's best popularity signal).
  const q   = `subject:"${subject}" first_publish_year:[${startYear} TO ${endYear}] language:eng`;
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=${limit * 5}&sort=editions`;
  const res = await fetch(url, { headers: { "User-Agent": "TheBracketClub-Seed/1.0" } });
  if (!res.ok) throw new Error(`OL ${res.status} for ${q}`);
  const data = await res.json();
  return (data.docs || []).map((d) => ({
    ol_key:        d.key,
    title:         d.title,
    author:        (d.author_name || [])[0],
    year:          d.first_publish_year,
    cover_id:      d.cover_i,
    isbns:         d.isbn || [],
    edition_count: d.edition_count || 0,
    language:      (d.language || [])[0] || null,
  }));
}

// Title-substring blocklist for textbooks, anthologies, leveled readers etc.
// These mostly come from the Open Library "biography" / "literature" subjects
// where reference materials are mistakenly tagged.
const TITLE_NOISE_REGEX = /\b(textbook|leveled reader|anthology|encyclopedia|workbook|handbook|teacher's guide|study guide|companion|complete works|collected works|short fiction of|stories of [a-z]+ [a-z]+|reader's edition|critical edition|annotated)\b/i;

// Cyrillic, CJK, Greek, Arabic — rough "definitely not English" detector
const NON_LATIN_REGEX = /[Ѐ-ӿ一-鿿぀-ヿͰ-Ͽ֐-ۿ]/;

function passesFilter(b, decade) {
  if (!b.title || !b.author) return false;
  if (!b.cover_id) return false;
  if (b.year < decade.start || b.year > decade.end) return false;
  if (PD_AUTHOR_BLOCKLIST.has(b.author.toLowerCase())) return false;
  if (TITLE_NOISE_REGEX.test(b.title)) return false;
  if (NON_LATIN_REGEX.test(b.title)) return false;
  return true;
}

// ── Google Books enrichment ──────────────────────────────────────────────────
const NON_LATIN_REGEX_ENRICH = /[Ѐ-ӿ一-鿿぀-ヿͰ-Ͽ֐-ۿ]/;

async function enrich(book) {
  const q = book.isbns?.[0]
    ? `isbn:${book.isbns[0]}`
    : `intitle:"${book.title}"+inauthor:"${book.author}"`;
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=3${GOOGLE_KEY ? `&key=${GOOGLE_KEY}` : ""}`;
  try {
    const res  = await fetch(url);
    if (!res.ok) return book;
    const data = await res.json();
    const hit  = (data.items || [])[0];
    if (!hit) return book;
    const v = hit.volumeInfo || {};
    // Prefer Google's title when OL's contains non-Latin chars (Cyrillic, CJK,
    // Greek, etc.) — Google usually returns the English translation.  For
    // Latin-alphabet foreign titles ("Como agua para chocolate") OL's text is
    // kept; admin can rename via /admin if needed.
    const olHasNonLatin = NON_LATIN_REGEX_ENRICH.test(book.title || "");
    return {
      ...book,
      title:         olHasNonLatin && v.title ? v.title : (book.title || v.title),
      author:        book.author      || (v.authors || [])[0],
      description:   v.description    || null,
      cover_url:     v.imageLinks?.thumbnail?.replace("http://", "https://")
                    || (book.cover_id ? `https://covers.openlibrary.org/b/id/${book.cover_id}-L.jpg` : null),
      isbn_13:       (v.industryIdentifiers || []).find((i) => i.type === "ISBN_13")?.identifier
                    || book.isbns?.[0] || null,
      published_at:  v.publishedDate || `${book.year}-01-01`,
      google_id:     hit.id,
      google_categories: v.categories || [],
    };
  } catch (e) {
    console.warn(`  [enrich-fail] ${book.title}: ${e.message}`);
    return book;
  }
}

// ── Main pipeline ────────────────────────────────────────────────────────────
async function buildCatalog() {
  const rawBooks = [];

  // 1. Historical books per category × decade
  for (const cat of CATEGORIES) {
    for (const dec of DECADES) {
      // YA didn't exist before 1990s — skip empty buckets
      if (cat.id === "young_adult" && dec.end < 1990) continue;

      process.stdout.write(`[${cat.id} ${dec.start}s] `);
      try {
        const raw    = await fetchOpenLibrary(cat.subject, dec.start, dec.end, cat.target_per_decade);
        const passed = raw.filter((b) => passesFilter(b, dec)).slice(0, cat.target_per_decade);
        passed.forEach((b) => rawBooks.push({ ...b, category: cat.id, genres: cat.genres }));
        console.log(`got ${passed.length}`);
      } catch (e) {
        console.log(`FAIL: ${e.message}`);
      }
      await sleep(150);
    }
  }

  // 2. Curated future
  for (const c of CURATED_FUTURE) {
    const cat = CATEGORIES.find((x) => x.id === c.category);
    rawBooks.push({
      title:         c.title,
      author:        c.author,
      year:          c.year,
      month:         c.month,
      category:      c.category,
      genres:        cat?.genres || [c.category],
      edition_count: 0,
      isbns:         [],
    });
  }

  console.log(`\nRaw harvested: ${rawBooks.length}`);

  // 3. Enrich all via Google Books
  const enriched = [];
  for (let i = 0; i < rawBooks.length; i++) {
    const b = rawBooks[i];
    process.stdout.write(`\r[enrich ${i + 1}/${rawBooks.length}] ${b.title.slice(0, 50).padEnd(50)} `);
    enriched.push(await enrich(b));
    await sleep(120);                          // ~8/sec, well under 100/sec quota
  }
  console.log("\n");

  // 4. Dedupe by ISBN-13 (keeps first occurrence — earlier categories win)
  const seenIsbn  = new Set();
  const seenTitle = new Set();
  const final     = [];
  for (const b of enriched) {
    const isbnKey  = b.isbn_13;
    const titleKey = `${b.title?.toLowerCase()}::${b.author?.toLowerCase()}`;
    if (isbnKey && seenIsbn.has(isbnKey)) continue;
    if (seenTitle.has(titleKey)) continue;
    if (isbnKey)  seenIsbn.add(isbnKey);
    seenTitle.add(titleKey);
    final.push(b);
  }
  console.log(`After dedupe: ${final.length}`);

  // 5. Shape into items rows
  const rows = final.map((b) => {
    const date  = (b.published_at || "").match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/);
    const year  = date ? +date[1] : (b.year || null);
    const month = date && date[2] ? +date[2] : (b.month || null);
    const day   = date && date[3] ? +date[3] : 1;
    return {
      category_id:   "books",
      title:         b.title,
      creators:      [b.author].filter(Boolean),
      cover_url:     b.cover_url || null,
      description:   b.description || null,
      published_at:  year ? `${year}-${String(month || 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` : null,
      published_year:  year,
      published_month: month,
      genres:        b.genres,
      tags:          [],
      external_ids:  {
        google_books_id: b.google_id || null,
        open_library_id: b.ol_key || null,
        isbn_13:         b.isbn_13 || null,
      },
      metadata:      {
        popularity_score: b.edition_count || 0,
        google_categories: b.google_categories || [],
        seed_source:     b.google_id ? "google_books" : (b.ol_key ? "open_library" : "curated"),
      },
      is_verified:   true,
      source:        b.google_id ? "google_books" : (b.ol_key ? "open_library" : "curated"),
      source_id:     b.google_id || b.ol_key || `curated:${b.title}:${b.author}`,
    };
  });

  await fs.writeFile(OUT_PATH, JSON.stringify(rows, null, 2));
  console.log(`Wrote ${rows.length} rows → ${OUT_PATH}`);
}

buildCatalog().catch((e) => { console.error(e); process.exit(1); });
