/**
 * communityBrackets.js — curated brackets every user gets by default.
 *
 * Each bracket is a definition (not a saved instance).  When a user opens
 * a community bracket for the first time, BracketHub forks it into their
 * personal customBrackets storage with a `presetId` reference, so the user's
 * picks persist locally but the catalog stays clean.
 *
 * Adding a new bracket: append to COMMUNITY_BRACKETS with a unique `id`,
 * an emoji + title + tagline, an array of genre tags (matched to
 * userPreferences.GENRE_OPTIONS), a format, and a books[] array.
 *
 * Books here are intentionally minimal — title + author + cover URL when
 * known.  The Cover component falls back to a coloured tile for missing
 * cover URLs, so it's safe to ship with cover: "" if needed.
 *
 * Cover URLs use Open Library's ISBN endpoint when available
 * (https://covers.openlibrary.org/b/isbn/{isbn}/L.jpg) for stability.
 */

// Helper for compact cover URLs by ISBN
const ol = (isbn) => `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;

export const COMMUNITY_BRACKETS = [
  // ── Fantasy ──────────────────────────────────────────────────────────
  {
    id:       "fantasy_series_goat",
    icon:     "🐉",
    title:    "Greatest Fantasy Series",
    tagline:  "The cornerstones of the genre — pick your favourite world",
    genres:   ["fantasy", "ya"],
    format:   "single_elim",
    size:     8,
    books: [
      { title: "The Lord of the Rings",        author: "J.R.R. Tolkien",     cover: ol("9780544003415") },
      { title: "A Game of Thrones",            author: "George R.R. Martin", cover: ol("9780553573404") },
      { title: "Harry Potter & the Sorcerer's Stone", author: "J.K. Rowling", cover: ol("9780590353427") },
      { title: "Mistborn: The Final Empire",   author: "Brandon Sanderson",  cover: ol("9780765350381") },
      { title: "The Name of the Wind",         author: "Patrick Rothfuss",   cover: ol("9780756404741") },
      { title: "The Way of Kings",             author: "Brandon Sanderson",  cover: ol("9780765326355") },
      { title: "The Wheel of Time: Eye of the World", author: "Robert Jordan", cover: ol("9780812511819") },
      { title: "The Fifth Season",             author: "N.K. Jemisin",       cover: ol("9780316229296") },
    ],
  },

  // ── Sci-Fi ───────────────────────────────────────────────────────────
  {
    id:       "scifi_classics",
    icon:     "🚀",
    title:    "Most Influential Sci-Fi",
    tagline:  "The novels that shaped how we imagine the future",
    genres:   ["scifi", "classics"],
    format:   "single_elim",
    size:     8,
    books: [
      { title: "Dune",                         author: "Frank Herbert",      cover: ol("9780441172719") },
      { title: "Foundation",                   author: "Isaac Asimov",       cover: ol("9780553293357") },
      { title: "The Hitchhiker's Guide to the Galaxy", author: "Douglas Adams", cover: ol("9780345391803") },
      { title: "Ender's Game",                 author: "Orson Scott Card",   cover: ol("9780812550702") },
      { title: "Snow Crash",                   author: "Neal Stephenson",    cover: ol("9780553380958") },
      { title: "Hyperion",                     author: "Dan Simmons",        cover: ol("9780553283686") },
      { title: "Neuromancer",                  author: "William Gibson",     cover: ol("9780441569595") },
      { title: "The Three-Body Problem",       author: "Liu Cixin",          cover: ol("9780765382030") },
    ],
  },

  // ── Horror ───────────────────────────────────────────────────────────
  {
    id:       "horror_modern",
    icon:     "💀",
    title:    "Best Modern Horror",
    tagline:  "What kept you up reading past 2 AM",
    genres:   ["horror"],
    format:   "single_elim",
    size:     8,
    books: [
      { title: "The Shining",                  author: "Stephen King",       cover: ol("9780307743657") },
      { title: "It",                           author: "Stephen King",       cover: ol("9781501142970") },
      { title: "Pet Sematary",                 author: "Stephen King",       cover: ol("9781501156700") },
      { title: "Mexican Gothic",               author: "Silvia Moreno-Garcia", cover: ol("9780525620785") },
      { title: "Bird Box",                     author: "Josh Malerman",      cover: ol("9780062259660") },
      { title: "The Haunting of Hill House",   author: "Shirley Jackson",    cover: ol("9780143039983") },
      { title: "House of Leaves",              author: "Mark Z. Danielewski", cover: ol("9780375703768") },
      { title: "The Only Good Indians",        author: "Stephen Graham Jones", cover: ol("9781982136451") },
    ],
  },

  // ── Mystery / Thriller ───────────────────────────────────────────────
  {
    id:       "mystery_modern",
    icon:     "🔍",
    title:    "Best Mystery & Thriller",
    tagline:  "Twists you didn't see coming",
    genres:   ["mystery"],
    format:   "single_elim",
    size:     8,
    books: [
      { title: "Gone Girl",                    author: "Gillian Flynn",      cover: ol("9780307588371") },
      { title: "And Then There Were None",     author: "Agatha Christie",    cover: ol("9780062073488") },
      { title: "The Silent Patient",           author: "Alex Michaelides",   cover: ol("9781250301697") },
      { title: "The Girl with the Dragon Tattoo", author: "Stieg Larsson",   cover: ol("9780307454546") },
      { title: "The Da Vinci Code",            author: "Dan Brown",          cover: ol("9780307474278") },
      { title: "In the Woods",                 author: "Tana French",        cover: ol("9780143113492") },
      { title: "Big Little Lies",              author: "Liane Moriarty",     cover: ol("9780425274866") },
      { title: "The Thursday Murder Club",     author: "Richard Osman",      cover: ol("9781984880987") },
    ],
  },

  // ── Romance ──────────────────────────────────────────────────────────
  {
    id:       "romance_loved",
    icon:     "💕",
    title:    "Most Beloved Romances",
    tagline:  "From classics to modern swoon",
    genres:   ["romance"],
    format:   "single_elim",
    size:     8,
    books: [
      { title: "Pride and Prejudice",          author: "Jane Austen",        cover: ol("9780141439518") },
      { title: "Outlander",                    author: "Diana Gabaldon",     cover: ol("9780440212560") },
      { title: "Beach Read",                   author: "Emily Henry",        cover: ol("9781984806734") },
      { title: "People We Meet on Vacation",   author: "Emily Henry",        cover: ol("9781984806758") },
      { title: "The Hating Game",              author: "Sally Thorne",       cover: ol("9780062439598") },
      { title: "It Ends with Us",              author: "Colleen Hoover",     cover: ol("9781501110368") },
      { title: "The Seven Husbands of Evelyn Hugo", author: "Taylor Jenkins Reid", cover: ol("9781501161933") },
      { title: "Red, White & Royal Blue",      author: "Casey McQuiston",    cover: ol("9781250316776") },
    ],
  },

  // ── Dystopian ────────────────────────────────────────────────────────
  {
    id:       "dystopian_greats",
    icon:     "🌑",
    title:    "Greatest Dystopian Novels",
    tagline:  "Visions of futures gone wrong",
    genres:   ["scifi", "literary", "classics"],
    format:   "single_elim",
    size:     8,
    books: [
      { title: "1984",                         author: "George Orwell",      cover: ol("9780451524935") },
      { title: "Brave New World",              author: "Aldous Huxley",      cover: ol("9780060850524") },
      { title: "The Handmaid's Tale",          author: "Margaret Atwood",    cover: ol("9780385490818") },
      { title: "Fahrenheit 451",               author: "Ray Bradbury",       cover: ol("9781451673319") },
      { title: "The Hunger Games",             author: "Suzanne Collins",    cover: ol("9780439023528") },
      { title: "The Road",                     author: "Cormac McCarthy",    cover: ol("9780307387899") },
      { title: "We",                           author: "Yevgeny Zamyatin",   cover: ol("9780140185850") },
      { title: "Station Eleven",               author: "Emily St. John Mandel", cover: ol("9780804172448") },
    ],
  },

  // ── Tearjerkers ──────────────────────────────────────────────────────
  {
    id:       "made_you_cry",
    icon:     "🪞",
    title:    "Books That Made You Cry",
    tagline:  "Bring tissues — pick the one that hit hardest",
    genres:   ["literary", "ya", "romance"],
    format:   "single_elim",
    size:     8,
    books: [
      { title: "The Fault in Our Stars",       author: "John Green",         cover: ol("9780525478812") },
      { title: "Where the Crawdads Sing",      author: "Delia Owens",        cover: ol("9780735219090") },
      { title: "A Little Life",                author: "Hanya Yanagihara",   cover: ol("9780804172707") },
      { title: "Bridge to Terabithia",         author: "Katherine Paterson", cover: ol("9780064401845") },
      { title: "Me Before You",                author: "Jojo Moyes",         cover: ol("9780143124542") },
      { title: "The Book Thief",               author: "Markus Zusak",       cover: ol("9780375842207") },
      { title: "A Man Called Ove",             author: "Fredrik Backman",    cover: ol("9781476738024") },
      { title: "Eleanor Oliphant Is Completely Fine", author: "Gail Honeyman", cover: ol("9780735220683") },
    ],
  },

  // ── Literary Fiction ─────────────────────────────────────────────────
  {
    id:       "modern_literary",
    icon:     "📚",
    title:    "Modern Literary Classics",
    tagline:  "21st-century novels that earned their place",
    genres:   ["literary", "classics"],
    format:   "single_elim",
    size:     8,
    books: [
      { title: "The Road",                     author: "Cormac McCarthy",    cover: ol("9780307387899") },
      { title: "Cloud Atlas",                  author: "David Mitchell",     cover: ol("9780375507250") },
      { title: "Beloved",                      author: "Toni Morrison",      cover: ol("9781400033416") },
      { title: "Never Let Me Go",              author: "Kazuo Ishiguro",     cover: ol("9781400078776") },
      { title: "The Brief Wondrous Life of Oscar Wao", author: "Junot Díaz", cover: ol("9781594483295") },
      { title: "The Underground Railroad",     author: "Colson Whitehead",   cover: ol("9780385542364") },
      { title: "Lincoln in the Bardo",         author: "George Saunders",    cover: ol("9780812995343") },
      { title: "A Visit from the Goon Squad",  author: "Jennifer Egan",      cover: ol("9780307477477") },
    ],
  },

  // ── Coming-of-Age ────────────────────────────────────────────────────
  {
    id:       "coming_of_age",
    icon:     "🎓",
    title:    "Best Coming-of-Age",
    tagline:  "The novels that grew up with us",
    genres:   ["literary", "ya"],
    format:   "single_elim",
    size:     8,
    books: [
      { title: "The Catcher in the Rye",       author: "J.D. Salinger",      cover: ol("9780316769488") },
      { title: "The Perks of Being a Wallflower", author: "Stephen Chbosky", cover: ol("9781451696196") },
      { title: "Looking for Alaska",           author: "John Green",         cover: ol("9780142402511") },
      { title: "The Kite Runner",              author: "Khaled Hosseini",    cover: ol("9781594631931") },
      { title: "To Kill a Mockingbird",        author: "Harper Lee",         cover: ol("9780061120084") },
      { title: "The Outsiders",                author: "S.E. Hinton",        cover: ol("9780142407332") },
      { title: "I Know Why the Caged Bird Sings", author: "Maya Angelou",    cover: ol("9780345514400") },
      { title: "A Tree Grows in Brooklyn",     author: "Betty Smith",        cover: ol("9780061120077") },
    ],
  },

  // ── YA Fantasy ───────────────────────────────────────────────────────
  {
    id:       "ya_fantasy",
    icon:     "🦄",
    title:    "Best YA Fantasy",
    tagline:  "Worlds that stayed with you",
    genres:   ["ya", "fantasy"],
    format:   "single_elim",
    size:     8,
    books: [
      { title: "Harry Potter & the Sorcerer's Stone", author: "J.K. Rowling", cover: ol("9780590353427") },
      { title: "Six of Crows",                 author: "Leigh Bardugo",      cover: ol("9781627792127") },
      { title: "Eragon",                       author: "Christopher Paolini", cover: ol("9780375826696") },
      { title: "Throne of Glass",              author: "Sarah J. Maas",      cover: ol("9781619630345") },
      { title: "A Court of Thorns and Roses",  author: "Sarah J. Maas",      cover: ol("9781635575569") },
      { title: "The Lightning Thief",          author: "Rick Riordan",       cover: ol("9780786838653") },
      { title: "Shadow and Bone",              author: "Leigh Bardugo",      cover: ol("9780805094596") },
      { title: "An Ember in the Ashes",        author: "Sabaa Tahir",        cover: ol("9781595148032") },
    ],
  },

  // ── Worldview Changers ───────────────────────────────────────────────
  {
    id:       "worldview_books",
    icon:     "🧠",
    title:    "Books That Changed Your Worldview",
    tagline:  "Non-fiction that rewired how you think",
    genres:   ["non_fiction"],
    format:   "single_elim",
    size:     8,
    books: [
      { title: "Sapiens",                      author: "Yuval Noah Harari",  cover: ol("9780062316097") },
      { title: "Thinking, Fast and Slow",      author: "Daniel Kahneman",    cover: ol("9780374533557") },
      { title: "Atomic Habits",                author: "James Clear",        cover: ol("9780735211292") },
      { title: "A Brief History of Time",      author: "Stephen Hawking",    cover: ol("9780553380163") },
      { title: "Man's Search for Meaning",     author: "Viktor Frankl",      cover: ol("9780807014295") },
      { title: "The Body Keeps the Score",     author: "Bessel van der Kolk", cover: ol("9780143127741") },
      { title: "Being Mortal",                 author: "Atul Gawande",       cover: ol("9781250076229") },
      { title: "Outliers",                     author: "Malcolm Gladwell",   cover: ol("9780316017930") },
    ],
  },

  // ── Pretenders ───────────────────────────────────────────────────────
  {
    id:       "books_pretend_read",
    icon:     "📖",
    title:    "Books People Pretend They've Read",
    tagline:  "Be honest — which one have you actually finished?",
    genres:   ["literary", "classics"],
    format:   "single_elim",
    size:     8,
    books: [
      { title: "Ulysses",                      author: "James Joyce",        cover: ol("9780679722762") },
      { title: "Infinite Jest",                author: "David Foster Wallace", cover: ol("9780316066525") },
      { title: "Gravity's Rainbow",            author: "Thomas Pynchon",     cover: ol("9780143039945") },
      { title: "War and Peace",                author: "Leo Tolstoy",        cover: ol("9781400079988") },
      { title: "Moby-Dick",                    author: "Herman Melville",    cover: ol("9780142437247") },
      { title: "A Brief History of Time",      author: "Stephen Hawking",    cover: ol("9780553380163") },
      { title: "Don Quixote",                  author: "Miguel de Cervantes", cover: ol("9780060934347") },
      { title: "The Brothers Karamazov",       author: "Fyodor Dostoevsky",  cover: ol("9780374528379") },
    ],
  },
];

/** Look up a community bracket by id. */
export function getCommunityBracket(id) {
  return COMMUNITY_BRACKETS.find((b) => b.id === id) || null;
}
