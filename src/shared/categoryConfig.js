/**
 * categoryConfig.js — per-category UI strings and preference definitions.
 *
 * ADDING A NEW CATEGORY (e.g. movies):
 *   1. Copy BOOKS_CONFIG, change every field to suit the new category.
 *   2. Export it as MOVIES_CONFIG (or similar).
 *   3. Update getCategoryConfig() to read the current route or accept a param.
 *   4. Create src/categories/movies/ with data.js (fetchers/parsers) and share.js (card generators).
 *   5. Add a route in src/CategoryRouter.jsx.
 *
 * The trendingPreferences block is intentionally generic — field names like
 * selectedCategories / selectedTags work for books, movies, games, etc.
 * The actual option IDs and labels are the only thing that differs per category.
 */

export const BOOKS_CONFIG = {
  id: "books",
  singular: "book",
  plural: "books",
  verb: "read",
  pastVerb: "read",
  champion: "Book of the Year",
  source: "Goodreads",
  trendingLabel: "Trending Books",
  icon: "📚",
  trendingIcon: "🔥",
  searchPlaceholder: "Search for a book...",
  addManualFields: ["title", "author", "cover"],
  welcomeHeadline: "Turn your year of reading into a tournament.",
  welcomeSub: "Log what you read each month, pick your favorites, and crown your Book of the Year.",
  trendingPreferences: {
    categoryQuestion: "What kind of books do you usually enjoy?",
    tagQuestion: "What are you usually looking for?",
    excludedTagQuestion: "Anything you want to see less of?",
    discoveryQuestion: "How should Trending feel?",
    categoryOptions: [
      { id: "fantasy",           label: "Fantasy" },
      { id: "sci_fi",            label: "Sci-Fi" },
      { id: "romance",           label: "Romance" },
      { id: "mystery_thriller",  label: "Mystery / Thriller" },
      { id: "horror",            label: "Horror" },
      { id: "literary_fiction",  label: "Literary Fiction" },
      { id: "historical_fiction",label: "Historical Fiction" },
      { id: "nonfiction",        label: "Nonfiction" },
      { id: "memoir_biography",  label: "Memoir / Biography" },
      { id: "business",          label: "Business" },
      { id: "self_improvement",  label: "Self-Improvement" },
      { id: "young_adult",       label: "Young Adult" },
      { id: "classics",          label: "Classics" },
      { id: "graphic_novels",    label: "Graphic Novels" },
    ],
    tagOptions: [
      { id: "page_turners",      label: "Page-turners" },
      { id: "emotional",         label: "Emotional stories" },
      { id: "cozy",              label: "Cozy reads" },
      { id: "dark_intense",      label: "Dark / intense" },
      { id: "thought_provoking", label: "Smart / thought-provoking" },
      { id: "fun_easy",          label: "Fun and easy reads" },
      { id: "book_club",         label: "Book club picks" },
      { id: "award_winning",     label: "Award-winning" },
    ],
    excludedTagOptions: [
      { id: "romance_heavy",     label: "Romance-heavy books" },
      { id: "very_long",         label: "Very long books" },
      { id: "dark_violent",      label: "Dark or violent stories" },
      { id: "young_adult",       label: "Young Adult" },
      { id: "nonfiction",        label: "Nonfiction" },
      { id: "celebrity_memoir",  label: "Celebrity memoirs" },
      { id: "series_heavy",      label: "Series-heavy books" },
      { id: "slow_literary",     label: "Slow literary fiction" },
    ],
    discoveryOptions: [
      { id: "mainstream",  label: "Show me the biggest hits",        description: "Prioritize the most popular titles overall" },
      { id: "balanced",    label: "Mix popular with hidden gems",     description: "A blend of chart-toppers and taste matches" },
      { id: "taste_first", label: "Match my taste above all",        description: "Prioritize books that fit your preferences" },
    ],
  },
};

/**
 * Returns the config for the active category.
 * Today this is always books. When multi-category routing lands, this will
 * read the current path segment (e.g. /movies → MOVIES_CONFIG).
 */
export function getCategoryConfig() {
  return BOOKS_CONFIG;
}
