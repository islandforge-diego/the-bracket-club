// Book-specific data fetchers: Goodreads RSS, CSV, and Popular/Trending

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

export function extractGoodreadsUserId(input) {
  const m = input.match(/goodreads\.com\/review\/list(?:_rss)?\/(\d+)/);
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

    results.push({
      title,
      author,
      rating: rating >= 1 && rating <= 5 ? rating : null,
      year: d.getFullYear(),
      month: d.getMonth(),
      cover: cover && !cover.includes("nophoto") ? cover : "",
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

export async function fetchTrendingBooks(year, month) {
  const path = `/book/popular_by_date/${year}/${month + 1}`;
  const res = await fetch(`/api/goodreads?path=${encodeURIComponent(path)}`);
  if (!res.ok) throw new Error("Failed to fetch popular books");
  const html = await res.text();
  return parseTrendingBooksHTML(html);
}

export function parseTrendingBooksHTML(html) {
  const match = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
  if (!match) return [];
  const data = JSON.parse(match[1]);
  const apollo = data.props?.pageProps?.apolloState;
  if (!apollo) return [];
  const rootQ = apollo.ROOT_QUERY;
  const topListKey = Object.keys(rootQ).find(k => k.startsWith("getTopList"));
  const topList = rootQ?.[topListKey];
  if (!topList?.edges) return [];
  return topList.edges.slice(0, 12).map((edge, idx) => {
    const bookRef = edge.node?.__ref;
    const book = bookRef ? apollo[bookRef] : null;
    if (!book) return null;
    const contribRef = book.primaryContributorEdge?.node?.__ref;
    const contrib = contribRef ? apollo[contribRef] : null;
    const workRef = book.work?.__ref;
    const work = workRef ? apollo[workRef] : null;
    return {
      id: book.legacyId || Date.now() + idx,
      title: book.titleComplete || book.title || "",
      author: contrib?.name || "",
      cover: book.imageUrl || "",
      rating: work?.stats?.averageRating ? Math.round(work.stats.averageRating) : null,
      avgRating: work?.stats?.averageRating || null,
      ratingsCount: work?.stats?.ratingsCount || 0,
      popularity: edge.count || 0,
    };
  }).filter(Boolean);
}

export async function searchBooks(query) {
  const res = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&fields=title,author_name,cover_i&limit=6`);
  const data = await res.json();
  return (data.docs || []).map(d => ({
    title:  d.title || "",
    author: d.author_name?.[0] || "",
    cover:  d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : "",
  }));
}
