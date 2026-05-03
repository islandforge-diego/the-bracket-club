/**
 * Catalog categories — what we seed and how we map to Open Library subjects.
 *
 * Each category gets its own bucket of books. The `subject` field is the
 * exact Open Library subject string (case-sensitive, spaces matter).
 * `genres` is what we tag the book with in our `items.genres[]` column.
 *
 * `target_per_decade` × 8 decades (1950s → 2020s) ≈ historical count per
 * category. Plus the curated 2025-2030 list.  Total catalog ≈ 300 books.
 */

// Order matters: more specific subjects run FIRST so a book gets tagged with
// its narrowest correct genre.  Harry Potter should be "fantasy" not
// "literary fiction" — and since dedupe is first-wins, fantasy must run
// before the catch-all literary bucket.
export const CATEGORIES = [
  {
    id:                "horror",
    label:             "Horror",
    subject:           "horror tales",
    genres:            ["horror"],
    target_per_decade: 3,
  },
  {
    id:                "young_adult",
    label:             "Young Adult",
    subject:           "young adult fiction",
    genres:            ["young adult"],
    target_per_decade: 3,                     // YA didn't exist as a category until ~1990s
  },
  {
    id:                "romance",
    label:             "Romance",
    subject:           "love stories",
    genres:            ["romance"],
    target_per_decade: 4,
  },
  {
    id:                "mystery",
    label:             "Mystery / Thriller",
    subject:           "mystery and detective stories",
    genres:            ["mystery", "thriller"],
    target_per_decade: 4,
  },
  {
    id:                "fantasy",
    label:             "Fantasy",
    subject:           "fantasy fiction",
    genres:            ["fantasy"],
    target_per_decade: 4,
  },
  {
    id:                "scifi",
    label:             "Science Fiction",
    subject:           "science fiction",
    genres:            ["science fiction"],
    target_per_decade: 4,
  },
  {
    id:                "nonfiction",
    label:             "Non-Fiction",
    subject:           "biography",
    genres:            ["non-fiction", "biography"],
    target_per_decade: 4,
  },
  {
    id:                "literary",
    label:             "Literary Fiction",
    subject:           "literary fiction",    // narrower than "literature" or "fiction"
    genres:            ["literary fiction"],
    target_per_decade: 4,
  },
];

export const DECADES = [
  { start: 1950, end: 1959 },
  { start: 1960, end: 1969 },
  { start: 1970, end: 1979 },
  { start: 1980, end: 1989 },
  { start: 1990, end: 1999 },
  { start: 2000, end: 2009 },
  { start: 2010, end: 2019 },
  { start: 2020, end: 2024 },                 // through "today" (2026); curated covers 2025+
];

/**
 * Authors whose long-public-domain works keep getting reprinted with bogus
 * "first publish year" data on Open Library.  Skip them to avoid Frankenstein
 * showing up in the 2010s decade.
 */
export const PD_AUTHOR_BLOCKLIST = new Set([
  "william shakespeare",
  "jane austen",
  "charles dickens",
  "mary shelley",
  "bram stoker",
  "lewis carroll",
  "edgar allan poe",
  "h. p. lovecraft",
  "h.p. lovecraft",
  "robert e. howard",
  "arthur conan doyle",
  "f. scott fitzgerald",        // copyright lapsed 2021 → flood of reprints
  "william hope hodgson",
  "nathaniel hawthorne",
  "herman melville",
  "leo tolstoy",
  "fyodor dostoyevsky",
  "fyodor dostoevsky",
  "victor hugo",
  "alexandre dumas",
  "jules verne",
  "h. g. wells",
  "h.g. wells",
  "oscar wilde",
  "henry james",
  "joseph conrad",
  "thomas hardy",
  "george orwell",              // PD in some jurisdictions; many reprints
  "franz kafka",
  "marcel proust",
  "james joyce",
  "virginia woolf",
  "george macdonald",
  "l. frank baum",
  "frances hodgson burnett",
  "louisa may alcott",
  "rudyard kipling",
  "robert louis stevenson",
  "henry david thoreau",
  "ralph waldo emerson",
  "frederick douglass",
  "sun tzu",
  "niccolò machiavelli",
  "plato",
  "aristotle",
  "homer",
  "dante alighieri",
  "miguel de cervantes",
]);
