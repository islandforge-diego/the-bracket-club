const KEY = "logoBoard.v1";

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ items: state.items }));
  } catch {
    // Quota exceeded or storage disabled — silently ignore.
  }
}

export function clear() {
  try { localStorage.removeItem(KEY); } catch {}
}

export function newId() {
  return Math.random().toString(36).slice(2, 10);
}
