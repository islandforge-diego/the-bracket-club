/**
 * anonId.js — stable, browser-local identity for anonymous voters.
 *
 * Used by multiplayer brackets so a not-signed-in user can:
 *   1. Join a shared bracket
 *   2. Cast picks
 *   3. See "their" results (and have those picks come back if they reload)
 *
 * The id is a UUID stored in localStorage at bc_anon_id — it's the
 * "row password" for any participation row keyed to it (see migration 010
 * header for the security model).  Possessing the id lets you mutate that
 * participation; losing it = losing access (e.g. clearing browser data).
 *
 * The display name is auto-assigned from a fun-list on first use and
 * persisted alongside.  User can rename via the share/join modal.
 */

const ANON_ID_KEY      = "bc_anon_id";
const ANON_NAME_KEY    = "bc_anon_name";

const ANON_ADJECTIVES = [
  "Anonymous", "Mysterious", "Sneaky",  "Curious",  "Quiet",
  "Wandering", "Bold",       "Witty",   "Shy",      "Clever",
  "Cosmic",    "Dapper",     "Plucky",  "Stoic",    "Cheery",
];

const ANON_ANIMALS = [
  "Owl",   "Fox",     "Otter",   "Badger",  "Heron",
  "Wolf",  "Hedgehog","Lynx",    "Crow",    "Raccoon",
  "Stag",  "Marten",  "Falcon",  "Mole",    "Quokka",
];

function newUuid() {
  // crypto.randomUUID is widely available; fall back for older Safari.
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function pickRandomName() {
  const a = ANON_ADJECTIVES[Math.floor(Math.random() * ANON_ADJECTIVES.length)];
  const n = ANON_ANIMALS  [Math.floor(Math.random() * ANON_ANIMALS.length)];
  return `${a} ${n}`;
}

/** Get-or-create the device's anonymous id.  Persists across reloads. */
export function getAnonId() {
  if (typeof window === "undefined") return null;
  let id = null;
  try { id = localStorage.getItem(ANON_ID_KEY); } catch { /* ignore */ }
  if (!id) {
    id = newUuid();
    try { localStorage.setItem(ANON_ID_KEY, id); } catch { /* ignore */ }
  }
  return id;
}

/** Get-or-assign the device's anonymous display name. */
export function getAnonName() {
  if (typeof window === "undefined") return "Anonymous";
  let name = null;
  try { name = localStorage.getItem(ANON_NAME_KEY); } catch { /* ignore */ }
  if (!name) {
    name = pickRandomName();
    try { localStorage.setItem(ANON_NAME_KEY, name); } catch { /* ignore */ }
  }
  return name;
}

/** Update the user-facing display name (signed in or not). */
export function setAnonName(name) {
  if (typeof window === "undefined") return;
  const cleaned = (name || "").trim().slice(0, 40);
  if (!cleaned) return;
  try { localStorage.setItem(ANON_NAME_KEY, cleaned); } catch { /* ignore */ }
}
