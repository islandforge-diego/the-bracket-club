/**
 * storage.js — localStorage persistence helpers.
 *
 * Data is stored per-year so users can keep multiple years side by side:
 *   botb_2025, botb_2026       — personal shelf data (createStore("botb_"))
 *   botb_pop_2025, botb_pop_2026 — trending bracket data (createStore("botb_pop_"))
 *
 * When a real backend is added, the app layer (App.jsx) calls save()/get()
 * through these same functions — swapping to API calls only requires changing
 * the implementation here, not the call sites.
 *
 * Data shape per year:
 *   { months: Array<{ books, winner, bracketPicks? }>, bracket: {} }
 */

import { MONTHS } from './constants.js';

export function createStore(prefix) {
  return {
    get: (year) => {
      try { const v = localStorage.getItem(prefix + year); return v ? JSON.parse(v) : null; }
      catch { return null; }
    },
    set: (year, val) => {
      try { localStorage.setItem(prefix + year, JSON.stringify(val)); }
      catch (e) { console.error("Save failed:", e); }
    },
  };
}

export function freshData() {
  return {
    months: MONTHS.map(() => ({ books: [], winner: null })),
    bracket: {},
  };
}

export function freshTrendingData() {
  return {
    months: MONTHS.map(() => ({ books: [], winner: null, bracketPicks: {} })),
    bracket: {},
  };
}

export function migrateStorage() {
  const old = localStorage.getItem("botb26");
  if (old && !localStorage.getItem("botb_2026")) {
    localStorage.setItem("botb_2026", old);
  }
  if (old) localStorage.removeItem("botb26");
}
