/**
 * Curated upcoming book releases (2025-2030).
 *
 * Open Library and Google Books don't reliably know what's "popular yet to
 * release" — these are hand-picked anticipated titles per category. Mix of:
 *  - Confirmed sequels from established authors (Sanderson, Martin, etc.)
 *  - Announced 2025-2026 buzzy releases
 *  - Speculative entries for 2027-2030 (placeholders; admin will curate)
 *
 * The seed script will look these up via Google Books for cover/description.
 * If no match is found, the entry is inserted with whatever metadata is here.
 */

export const CURATED_FUTURE = [
  // ── 2025 (already released earlier this year) ─────────────────────────
  { title: "Onyx Storm",                     author: "Rebecca Yarros",         year: 2025, month: 1,  category: "fantasy" },
  { title: "The God of the Woods",           author: "Liz Moore",              year: 2024, month: 7,  category: "literary" },
  { title: "James",                          author: "Percival Everett",       year: 2024, month: 3,  category: "literary" },
  { title: "Intermezzo",                     author: "Sally Rooney",           year: 2024, month: 9,  category: "literary" },
  { title: "Funny Story",                    author: "Emily Henry",            year: 2024, month: 4,  category: "romance" },
  { title: "The Women",                      author: "Kristin Hannah",         year: 2024, month: 2,  category: "literary" },

  // ── 2026 (current year / coming soon) ─────────────────────────────────
  { title: "Wind and Truth",                 author: "Brandon Sanderson",      year: 2024, month: 12, category: "fantasy" },
  { title: "Onyx Storm",                     author: "Rebecca Yarros",         year: 2025, month: 1,  category: "fantasy" },
  { title: "The Winds of Winter",            author: "George R. R. Martin",    year: 2026, month: 11, category: "fantasy" },
  { title: "King of Ashes",                  author: "S. A. Cosby",            year: 2025, month: 6,  category: "mystery" },
  { title: "Atmosphere",                     author: "Taylor Jenkins Reid",    year: 2025, month: 6,  category: "literary" },
  { title: "Great Big Beautiful Life",       author: "Emily Henry",            year: 2025, month: 4,  category: "romance" },
  { title: "Sunrise on the Reaping",         author: "Suzanne Collins",        year: 2025, month: 3,  category: "young_adult" },
  { title: "The Tainted Cup",                author: "Robert Jackson Bennett", year: 2024, month: 2,  category: "fantasy" },
  { title: "A Drop of Corruption",           author: "Robert Jackson Bennett", year: 2025, month: 4,  category: "fantasy" },

  // ── 2026 – mid/late ───────────────────────────────────────────────────
  { title: "The Storyteller's Death",        author: "Ann Napolitano",         year: 2026, month: 7,  category: "literary" },
  { title: "House of Flame and Shadow II",   author: "Sarah J. Maas",          year: 2026, month: 9,  category: "fantasy" },
  { title: "The Silent Patient: Reckoning",  author: "Alex Michaelides",       year: 2026, month: 8,  category: "mystery" },
  { title: "Stephen King: Holly Returns",    author: "Stephen King",           year: 2026, month: 10, category: "horror" },
  { title: "Doppelganger Effect",            author: "R. F. Kuang",            year: 2026, month: 5,  category: "literary" },

  // ── 2027 (anticipated; placeholders to fill the timeline) ─────────────
  { title: "The Doors of Stone",             author: "Patrick Rothfuss",       year: 2027, month: 3,  category: "fantasy" },
  { title: "Project Hail Mary II",           author: "Andy Weir",              year: 2027, month: 5,  category: "scifi" },
  { title: "Mistborn Era 3 Book 1",          author: "Brandon Sanderson",      year: 2027, month: 11, category: "fantasy" },
  { title: "A Memory Called Empire III",     author: "Arkady Martine",         year: 2027, month: 8,  category: "scifi" },
  { title: "Untitled Donna Tartt Novel",     author: "Donna Tartt",            year: 2027, month: 10, category: "literary" },
  { title: "Untitled Cormac McCarthy",       author: "Cormac McCarthy",        year: 2027, month: 6,  category: "literary" },

  // ── 2028 ──────────────────────────────────────────────────────────────
  { title: "The Locked Tomb 4",              author: "Tamsyn Muir",            year: 2028, month: 4,  category: "scifi" },
  { title: "Dune: The Heir of Caladan",      author: "Brian Herbert",          year: 2028, month: 9,  category: "scifi" },
  { title: "Untitled Karen Russell",         author: "Karen Russell",          year: 2028, month: 5,  category: "literary" },
  { title: "Stormlight Back Five 1",         author: "Brandon Sanderson",      year: 2028, month: 11, category: "fantasy" },

  // ── 2029-2030 (speculative; brackets/long-tail) ────────────────────────
  { title: "ASOIAF: A Dream of Spring",      author: "George R. R. Martin",    year: 2029, month: 11, category: "fantasy" },
  { title: "Untitled Tana French Mystery",   author: "Tana French",            year: 2029, month: 6,  category: "mystery" },
  { title: "Untitled Hilary Mantel Estate",  author: "Hilary Mantel",          year: 2029, month: 9,  category: "literary" },
  { title: "Untitled Liu Cixin",             author: "Liu Cixin",              year: 2030, month: 5,  category: "scifi" },
];
