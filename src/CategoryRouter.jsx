/**
 * CategoryRouter — top-level route table for the app.
 *
 * Each category (books, movies, games, …) lives at its own path segment.
 * Adding a new category means:
 *   1. Create src/categories/<name>/ with data.js, share.js, etc.
 *   2. Add its config to src/shared/categoryConfig.js
 *   3. Import its page component below and add a <Route> entry.
 *
 * The catch-all redirect to /books keeps existing links working while
 * the landing page is under construction.
 */

import { Routes, Route, Navigate } from "react-router-dom";
import BooksApp from "./App.jsx";

// Future category imports go here, e.g.:
// import MoviesApp from "./pages/movies/MoviesApp.jsx";

export default function CategoryRouter() {
  return (
    <Routes>
      {/* Redirect bare root to the books category for now */}
      <Route path="/" element={<Navigate to="/books" replace />} />

      {/* Books category — the current app */}
      <Route path="/books/*" element={<BooksApp />} />

      {/* Future categories:
          <Route path="/movies/*" element={<MoviesApp />} />
          <Route path="/games/*"  element={<GamesApp />}  />
      */}

      {/* Fallback for any unknown path */}
      <Route path="*" element={<Navigate to="/books" replace />} />
    </Routes>
  );
}
