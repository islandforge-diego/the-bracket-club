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
