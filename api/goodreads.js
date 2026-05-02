export default async function handler(req, res) {
  const { path } = req.query;
  if (!path) return res.status(400).json({ error: "Missing path parameter" });

  const url = `https://www.goodreads.com${path}`;
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    const text = await response.text();
    res.setHeader("Content-Type", response.headers.get("content-type") || "text/xml");
    res.status(response.status).send(text);
  } catch (e) {
    res.status(502).json({ error: "Failed to fetch from Goodreads" });
  }
}
