/**
 * categories/books/data.js — all data fetching and parsing for the Books category.
 *
 * Three data sources:
 *   1. Goodreads RSS / CSV  — user's personal reading history (parseGoodreadsRSS/CSV)
 *   2. Goodreads popular_by_date — monthly trending books (fetchTrendingBooks)
 *      └─ with optional ?category= filter per user preference (fetchGenreTrending)
 *   3. Open Library search API — enriches books with genre subjects (enrichBooks)
 *
 * Enrichment pipeline (runs once per book, result cached in localStorage):
 *   fetchTrendingBooks / fetchGenreTrending
 *     → raw books { title, author, cover, popularity, description }
 *   enrichBooks
 *     → Open Library subjects → mapSubjectsToCategories → categories: string[]
 *     → description keyword scan → inferTagsFromDescription → tags: string[]
 *   rankTrending (shared/rankTrending.js)
 *     → scored and sorted list based on user preferences
 *
 * All fetch calls to Goodreads go through /api/goodreads (Vercel serverless proxy)
 * to avoid CORS. Open Library is called directly — it has permissive CORS headers.
 */

export function parseCSVLine(line) {
  const result = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === ',' && !inQ) {
      result.push(cur); cur = "";
    } else {
      cur += c;
    }
  }
  result.push(cur);
  return result;
}

export function parseGoodreadsCSV(text, targetYear) {
  const lines = text.replace(/\r/g, "").split("\n").filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]).map(h => h.trim());
  const items = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i]);
    const row = {};
    headers.forEach((h, j) => { row[h] = (vals[j] || "").trim(); });

    if (row["Exclusive Shelf"] !== "read") continue;

    const dm = row["Date Read"].match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
    if (!dm) continue;
    const year = parseInt(dm[1]);
    const month = parseInt(dm[2]) - 1;
    if (year !== targetYear || month < 0 || month > 11) continue;

    const rawRating = parseInt(row["My Rating"]);
    items.push({
      title:  row["Title"]  || "",
      author: row["Author"] || "",
      rating: rawRating >= 1 && rawRating <= 5 ? rawRating : null,
      month,
      cover:  "",
    });
  }
  return items;
}

/**
 * Pull the numeric Goodreads user ID out of a variety of inputs.
 *
 * Accepts:
 *   - A bare numeric ID:                   "152670076"
 *   - A profile URL with optional slug:    "https://www.goodreads.com/user/show/152670076-firstname-lastname"
 *   - A profile URL without slug:          "https://www.goodreads.com/user/show/152670076"
 *   - A review-list URL:                   "https://www.goodreads.com/review/list/152670076?shelf=read"
 *   - The RSS endpoint:                    "https://www.goodreads.com/review/list_rss/152670076?shelf=read"
 *
 * Returns null for usernames-only or anything else — Goodreads' RSS endpoint
 * needs the numeric ID and there's no public username→ID resolver we can
 * call without scraping HTML.  Caller surfaces a helpful error in that case.
 */
export function extractGoodreadsUserId(input) {
  const trimmed = (input || "").trim();
  if (!trimmed) return null;
  // Bare numeric ID
  if (/^\d+$/.test(trimmed)) return trimmed;
  // Match every URL form Goodreads ships:
  //   /user/show/{id}            (with or without -slug)
  //   /review/list/{id}          (with or without query string)
  //   /review/list_rss/{id}
  const m = trimmed.match(/goodreads\.com\/(?:user\/show|review\/list(?:_rss)?)\/(\d+)/);
  return m ? m[1] : null;
}

export async function fetchGoodreadsRSS(userId, page = 1) {
  const rssPath = `/review/list_rss/${userId}?shelf=read&per_page=200&page=${page}`;
  const res = await fetch(`/api/goodreads?path=${encodeURIComponent(rssPath)}`);
  if (!res.ok) throw new Error("Failed to fetch Goodreads data");
  return await res.text();
}

export function parseGoodreadsRSS(xmlText, targetYear) {
  return parseGoodreadsRSSAll(xmlText).filter(b => b.year === targetYear);
}

export function parseGoodreadsRSSAll(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "text/xml");
  const items = doc.querySelectorAll("item");
  const results = [];

  items.forEach(item => {
    const dateStr = item.querySelector("user_read_at")?.textContent?.trim();
    if (!dateStr) return;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return;

    const title = item.querySelector("title")?.textContent?.trim() || "";
    const author = item.querySelector("author_name")?.textContent?.trim() || "";
    const cover = item.querySelector("book_large_image_url")?.textContent?.trim() || item.querySelector("book_image_url")?.textContent?.trim() || "";
    const ratingStr = item.querySelector("user_rating")?.textContent?.trim();
    const rating = parseInt(ratingStr);
    const rawDesc = item.querySelector("book_description")?.textContent?.trim() || "";
    const description = rawDesc.replace(/<[^>]*>/g, "").trim();

    results.push({
      title,
      author,
      rating: rating >= 1 && rating <= 5 ? rating : null,
      year: d.getFullYear(),
      month: d.getMonth(),
      cover: cover && !cover.includes("nophoto") ? cover : "",
      description,
    });
  });
  return results;
}

export async function fetchAllGoodreadsBooks(userId) {
  const allItems = [];
  for (let page = 1; page <= 10; page++) {
    const xml = await fetchGoodreadsRSS(userId, page);
    const items = parseGoodreadsRSSAll(xml);
    if (items.length === 0) break;
    allItems.push(...items);
    if (items.length < 200) break;
  }
  return allItems;
}

// Maps our category IDs to Goodreads popular_by_date category slugs
const CATEGORY_TO_GR_SLUG = {
  fantasy:            "fantasy",
  sci_fi:             "science-fiction",
  romance:            "romance",
  mystery_thriller:   "mystery-thriller-suspense",
  horror:             "horror",
  literary_fiction:   "literary-fiction",
  historical_fiction: "historical-fiction",
  nonfiction:         "nonfiction",
  memoir_biography:   "biography-memoir",
  business:           "business",
  self_improvement:   "self-help",
  young_adult:        "young-adult",
  classics:           "classics",
  graphic_novels:     "graphic-novels",
};

export async function fetchTrendingBooks(year, month) {
  const path = `/book/popular_by_date/${year}/${month + 1}`;
  const res = await fetch(`/api/goodreads?path=${encodeURIComponent(path)}`);
  if (!res.ok) throw new Error("Failed to fetch popular books");
  const html = await res.text();
  return parseTrendingBooksHTML(html);
}

export async function fetchGenreTrending(year, month, categoryId) {
  const slug = CATEGORY_TO_GR_SLUG[categoryId];
  if (!slug) return [];
  try {
    const path = `/book/popular_by_date/${year}/${month + 1}?category=${slug}`;
    const res = await fetch(`/api/goodreads?path=${encodeURIComponent(path)}`);
    if (!res.ok) return [];
    const html = await res.text();
    return parseTrendingBooksHTML(html, 20);
  } catch {
    return [];
  }
}

export function parseTrendingBooksHTML(html, limit = 12) {
  const match = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
  if (!match) return [];
  const data = JSON.parse(match[1]);
  const apollo = data.props?.pageProps?.apolloState;
  if (!apollo) return [];
  const rootQ = apollo.ROOT_QUERY;
  const topListKey = Object.keys(rootQ).find(k => k.startsWith("getTopList"));
  const topList = rootQ?.[topListKey];
  if (!topList?.edges) return [];
  return topList.edges.slice(0, limit).map((edge, idx) => {
    const bookRef = edge.node?.__ref;
    const book = bookRef ? apollo[bookRef] : null;
    if (!book) return null;
    const contribRef = book.primaryContributorEdge?.node?.__ref;
    const contrib = contribRef ? apollo[contribRef] : null;
    const workRef = book.work?.__ref;
    const work = workRef ? apollo[workRef] : null;
    const rawDesc = book.description;
    const descStr = typeof rawDesc === "object"
      ? (rawDesc?.html || rawDesc?.text || "")
      : (rawDesc || "");
    return {
      id: book.legacyId || Date.now() + idx,
      title: book.titleComplete || book.title || "",
      author: contrib?.name || "",
      cover: book.imageUrl || "",
      rating: work?.stats?.averageRating ? Math.round(work.stats.averageRating) : null,
      avgRating: work?.stats?.averageRating || null,
      ratingsCount: work?.stats?.ratingsCount || 0,
      popularity: edge.count || 0,
      description: descStr.replace(/<[^>]*>/g, "").trim(),
    };
  }).filter(Boolean);
}

// ─── Book enrichment ─────────────────────────────────────────────────────────

// Open Library subject strings (case-insensitive substring match)
const SUBJECT_CATEGORY_MAP = {
  fantasy:            ["fantasy", "magic", "wizard", "dragon", "fae", "fairy tale", "fairy stories", "witches", "sorcery", "enchant"],
  sci_fi:             ["science fiction", "science-fiction", "sci-fi", "space opera", "dystopia", "dystopian", "cyberpunk", "time travel", "extraterrestrial", "apocalyptic", "speculative fiction"],
  romance:            ["romance", "romantic", "love stories", "love story", "chick lit", "women's fiction", "man-woman relationships", "courtship"],
  mystery_thriller:   ["mystery", "thriller", "detective", "crime fiction", "suspense", "noir", "spy", "espionage", "murder", "police"],
  horror:             ["horror", "ghost stories", "ghost story", "vampire", "occult", "supernatural fiction"],
  literary_fiction:   ["literary fiction", "psychological fiction", "general fiction", "domestic fiction"],
  historical_fiction: ["historical fiction", "history -- fiction", "historical -- fiction", "war stories"],
  nonfiction:         ["nonfiction", "non-fiction", "narrative nonfiction", "journalism", "essays", "true crime", "popular science", "popular culture"],
  memoir_biography:   ["biography", "autobiography", "memoir", "biographical", "personal narratives"],
  business:           ["business", "economics", "finance", "entrepreneurship", "management", "leadership", "investing", "marketing", "startup"],
  self_improvement:   ["self-help", "personal development", "motivation", "productivity", "mindfulness", "psychology", "habits", "happiness"],
  young_adult:        ["young adult", "ya fiction", "teen fiction", "juvenile fiction", "children"],
  classics:           ["classics", "classic literature", "19th century fiction", "18th century fiction", "victorian"],
  graphic_novels:     ["comics", "graphic novel", "graphic novels", "manga", "illustrated"],
};

// Description text signals — fills gaps when Open Library subjects are too vague.
// These strings are checked against the full book description (lowercased).
const DESCRIPTION_CATEGORY_MAP = {
  romance:            ["fall in love", "falling in love", "love story", "second chance", "enemies to lovers", "forbidden love", "soulmate", "happily ever after", "steamy", "swoon", "their hearts", "sweeping romance", "romantic"],
  fantasy:            ["magic system", "chosen one", "dark lord", "ancient magic", "mythical", "enchanted forest", "quest to"],
  sci_fi:             ["space station", "alien species", "starship", "far future", "genetic engineering", "dystopian society"],
  mystery_thriller:   ["serial killer", "cold case", "missing person", "forensic", "under suspicion", "the killer"],
  horror:             ["haunted house", "supernatural evil", "unspeakable terror", "cursed"],
  business:           ["ceo", "startup founder", "venture capital", "wall street", "corporate", "entrepreneur", "business strategy"],
  memoir_biography:   ["growing up in", "my life", "true story", "first-hand", "personal journey"],
  self_improvement:   ["habits of", "how to achieve", "transform your", "unlock your potential", "proven method"],
  historical_fiction: ["set in the", "world war", "ancient rome", "victorian era", "18th century", "19th century"],
};

const TAG_KEYWORD_MAP = {
  page_turners:      ["gripping", "page-turning", "page-turner", "fast-paced", "can't put down", "addictive", "unputdownable", "propulsive"],
  emotional:         ["emotional", "heartbreaking", "moving", "touching", "tearjerker", "poignant", "devastating", "bittersweet"],
  cozy:              ["cozy", "heartwarming", "feel-good", "charming", "gentle", "whimsical", "comforting"],
  dark_intense:      ["dark", "intense", "disturbing", "gritty", "brutal", "graphic content", "harrowing"],
  thought_provoking: ["thought-provoking", "philosophical", "profound", "insightful", "intellectual", "complex themes"],
  fun_easy:          ["fun", "light-hearted", "hilarious", "funny", "humorous", "quick read", "breezy", "laugh"],
  book_club:         ["book club", "discussion guide", "nuanced", "layered"],
  award_winning:     ["pulitzer", "booker", "national book award", "award-winning", "award winning", "new york times bestseller", "oprah"],
};

function mapSubjectsToCategories(subjects) {
  if (!subjects?.length) return [];
  const lower = subjects.map(s => s.toLowerCase());
  return Object.entries(SUBJECT_CATEGORY_MAP)
    .filter(([, keywords]) => keywords.some(kw => lower.some(s => s.includes(kw))))
    .map(([id]) => id);
}

// Secondary signal: infer genre from the book's description text.
// Open Library subjects are often too generic ("Fiction", "American fiction")
// so description keywords act as a reliable fallback.
function inferCategoriesFromDescription(description) {
  if (!description) return [];
  const lower = description.toLowerCase();
  return Object.entries(DESCRIPTION_CATEGORY_MAP)
    .filter(([, keywords]) => keywords.some(kw => lower.includes(kw)))
    .map(([id]) => id);
}

function inferTagsFromDescription(description) {
  if (!description) return [];
  const lower = description.toLowerCase();
  return Object.entries(TAG_KEYWORD_MAP)
    .filter(([, keywords]) => keywords.some(kw => lower.includes(kw)))
    .map(([id]) => id);
}

export async function enrichBooks(books) {
  return Promise.all(books.map(async book => {
    // _enriched flag means we already ran the full pipeline on this book.
    // Checking categories !== undefined is not enough — an empty [] result
    // from a failed OL lookup would permanently block re-enrichment otherwise.
    if (book._enriched) return book;
    try {
      const q = [book.title, book.author].filter(Boolean).join(" ");
      const res = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&fields=subject&limit=1`);
      const data = await res.json();
      const subjects = data.docs?.[0]?.subject || [];

      // Combine Open Library subjects + description signals, deduplicated
      const fromSubjects = mapSubjectsToCategories(subjects);
      const fromDesc = inferCategoriesFromDescription(book.description);
      const categories = [...new Set([...fromSubjects, ...fromDesc])];
      const tags = inferTagsFromDescription(book.description);

      return { ...book, categories, tags, _enriched: true };
    } catch {
      // On network failure, store empty arrays but do NOT set _enriched so
      // the next load retries the lookup.
      return { ...book, categories: [], tags: [] };
    }
  }));
}

// User-facing book search.  Hits the same /api/google-books proxy the admin
// catalog tool uses so user adds carry stable IDs (googleBooksId, isbn13)
// that ensureItem() can dedup against the verified seeded catalog.
//
// Falls back to Open Library if the proxy is unavailable (eg. dev without
// GOOGLE_BOOKS_API_KEY) — those results lack googleBooksId so they'll be
// inserted as fresh user-owned items, same as before.
export async function searchBooks(query) {
  // ── Primary: Google Books via our serverless proxy ────────────────────
  try {
    const res = await fetch(`/api/google-books?q=${encodeURIComponent(query)}&maxResults=8`);
    if (res.ok) {
      const data = await res.json();
      return (data.items || []).map(b => ({
        title:         b.title || "",
        author:        (b.authors || [])[0] || "",
        cover:         b.coverUrl || "",
        // Pass-through IDs for catalog dedup in ensureItem()
        googleBooksId: b.googleBooksId || null,
        isbn13:        b.isbn13 || null,
        // Pass-through metadata so the user's first add populates rich data
        description:   b.description || null,
        publishedDate: b.publishedDate || null,
        genres:        b.genres || [],
      }));
    }
  } catch { /* fall through to OL fallback */ }

  // ── Fallback: Open Library (original behaviour, no IDs) ───────────────
  const res = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&fields=title,author_name,cover_i&limit=6`);
  const data = await res.json();
  return (data.docs || []).map(d => ({
    title:  d.title || "",
    author: d.author_name?.[0] || "",
    cover:  d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : "",
  }));
}
