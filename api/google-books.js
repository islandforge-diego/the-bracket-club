/**
 * api/google-books.js — Vercel serverless proxy for Google Books API.
 *
 * Keeps the API key server-side and avoids CORS issues.
 *
 * Usage:
 *   GET /api/google-books?q=intermezzo&maxResults=10
 *   GET /api/google-books?q=isbn:9780593538654
 *
 * Returns the raw Google Books API JSON response.
 * Requires env var: GOOGLE_BOOKS_API_KEY
 */
export default async function handler(req, res) {
  const { q, maxResults = 12, orderBy = "relevance" } = req.query;

  if (!q) return res.status(400).json({ error: "Missing query parameter: q" });

  const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Google Books API key not configured" });

  const params = new URLSearchParams({
    q,
    maxResults: String(Math.min(Number(maxResults), 40)),
    orderBy,
    printType: "books",
    key: apiKey,
  });

  const url = `https://www.googleapis.com/books/v1/volumes?${params}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data?.error?.message ?? "Google Books error" });
    }

    // Normalize the response to a clean array of book objects
    const items = (data.items ?? []).map((item) => {
      const info = item.volumeInfo ?? {};
      const images = info.imageLinks ?? {};
      return {
        googleBooksId: item.id,
        title: info.title ?? "Unknown Title",
        authors: info.authors ?? [],
        publishedDate: info.publishedDate ?? null,   // e.g. "2024-09-26" or "2024"
        description: info.description ?? null,
        genres: info.categories ?? [],
        coverUrl: (images.thumbnail ?? images.smallThumbnail ?? "")
          .replace("http://", "https://")           // Google returns http
          .replace("&edge=curl", ""),               // remove curled-corner effect
        pageCount: info.pageCount ?? null,
        language: info.language ?? null,
        isbn13: (info.industryIdentifiers ?? [])
          .find((id) => id.type === "ISBN_13")?.identifier ?? null,
        previewLink: info.previewLink ?? null,
      };
    });

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    res.status(200).json({ items, totalItems: data.totalItems ?? 0 });
  } catch (e) {
    res.status(502).json({ error: "Failed to reach Google Books API" });
  }
}
