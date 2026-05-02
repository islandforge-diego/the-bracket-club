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
};

export function getCategoryConfig() {
  return BOOKS_CONFIG;
}
