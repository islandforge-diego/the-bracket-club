/**
 * cloudSync.js — bridge between localStorage and Supabase for shelves,
 * custom brackets, and user preferences.
 *
 * Design
 * ──────
 *   Local-first.  Reads/writes always hit localStorage synchronously; the
 *   cloud is a background mirror that activates only when a user is signed
 *   in.  This keeps the app fast, offline-capable, and identical for guests.
 *
 * Lifecycle
 * ─────────
 *   1. App.jsx subscribes to AuthContext and calls setCurrentUser(user)
 *      whenever the auth state changes.
 *   2. On a null → user transition: pullDown() merges remote into local
 *      (newer updated_at wins per row), then pushUp() flushes any local
 *      rows that don't yet exist remotely.
 *   3. On every storage write, the storage module calls schedulePush().
 *      That debounces (~800 ms) and then upserts each store independently.
 *   4. On user → null: stop syncing; local state is left intact.
 *
 * Conflict policy
 * ───────────────
 *   Per-row last-writer-wins by updated_at.  Deletes are tombstoned in
 *   localStorage (bc_sync_tombstones) and propagated up on next push, then
 *   cleared.  Pulled-down rows that the local store has tombstoned are
 *   re-deleted server-side rather than being resurrected locally.
 *
 * Failure mode
 * ────────────
 *   Network hiccups are silent — caught and logged.  The next schedulePush()
 *   will retry the whole batch.  Local state is never blocked on the cloud.
 */

import { supabase } from "../lib/supabase.js";

const TOMBSTONE_KEY = "bc_sync_tombstones";
const PUSH_DEBOUNCE_MS = 800;

let currentUser = null;
let pushTimer   = null;
let pushing     = false;
let dirty       = false;        // a write came in while we were pushing

// ── Tombstones ─────────────────────────────────────────────────────────────
// { shelves: ["shelf_xyz"], custom_brackets: ["cb_abc"] }

function readTombstones() {
  try { return JSON.parse(localStorage.getItem(TOMBSTONE_KEY)) || {}; }
  catch { return {}; }
}

function writeTombstones(t) {
  try { localStorage.setItem(TOMBSTONE_KEY, JSON.stringify(t)); }
  catch { /* ignore */ }
}

/** Mark a client_id as deleted so the next push removes it server-side. */
export function tombstone(table, clientId) {
  if (!clientId) return;
  const t = readTombstones();
  t[table] = t[table] || [];
  if (!t[table].includes(clientId)) t[table].push(clientId);
  writeTombstones(t);
  schedulePush();
}

function clearTombstones() { writeTombstones({}); }

// ── Local readers (lazy require to avoid circular imports) ─────────────────
function readShelvesLocal() {
  try { return JSON.parse(localStorage.getItem("bc_user_shelves")) || {}; }
  catch { return {}; }
}

function writeShelvesLocal(map) {
  try { localStorage.setItem("bc_user_shelves", JSON.stringify(map)); }
  catch { /* ignore */ }
}

function readBracketsLocal() {
  try { return JSON.parse(localStorage.getItem("bc_custom_brackets")) || {}; }
  catch { return {}; }
}

function writeBracketsLocal(map) {
  try { localStorage.setItem("bc_custom_brackets", JSON.stringify(map)); }
  catch { /* ignore */ }
}

function readPrefsLocal() {
  try { return JSON.parse(localStorage.getItem("bc_user_prefs")) || {}; }
  catch { return {}; }
}

function writePrefsLocal(p) {
  try { localStorage.setItem("bc_user_prefs", JSON.stringify(p)); }
  catch { /* ignore */ }
}

function readGoodreadsId() {
  try { return localStorage.getItem("bc_goodreads_user_id") || null; }
  catch { return null; }
}

function writeGoodreadsId(id) {
  try {
    if (id) localStorage.setItem("bc_goodreads_user_id", id);
    else    localStorage.removeItem("bc_goodreads_user_id");
  } catch { /* ignore */ }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Tell the sync layer who's signed in.  Call from a useEffect at App level
 * with the value from useAuth().  Pass null on sign-out.
 */
export function setCurrentUser(user) {
  const prev = currentUser;
  currentUser = user || null;

  // Null → signed in: pull then push
  if (!prev && currentUser && supabase) {
    syncNow().catch((e) => console.warn("[cloudSync] initial sync failed", e));
  }
}

/** Debounced push of every dirty store to Supabase. */
export function schedulePush() {
  if (!currentUser || !supabase) return;
  if (pushing) { dirty = true; return; }
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    pushUp().catch((e) => console.warn("[cloudSync] push failed", e));
  }, PUSH_DEBOUNCE_MS);
}

/** Force an immediate pull-then-push (used at sign-in). */
export async function syncNow() {
  if (!currentUser || !supabase) return;
  await pullDown();
  await pushUp();
}

// ── Pull (remote → local) ──────────────────────────────────────────────────
//
// Merge strategy: for each remote row, compare its updated_at to the local
// row's updated_at.  If remote is newer (or local doesn't exist), overwrite
// local.  If local is newer, leave it (push will handle it next).  If the
// row is in tombstones, skip — push will delete it server-side.

async function pullDown() {
  if (!currentUser || !supabase) return;
  const userId = currentUser.id;
  const tombs  = readTombstones();

  // ── Shelves
  {
    const { data, error } = await supabase
      .from("shelves").select("*").eq("user_id", userId);
    if (error) { console.warn("[cloudSync] pull shelves", error); }
    else if (data) {
      const local = readShelvesLocal();
      const tomb  = new Set(tombs.shelves || []);
      let changed = false;
      for (const r of data) {
        if (tomb.has(r.client_id)) continue;
        const localRow = local[r.client_id];
        const localTime  = localRow?.updatedAt ? new Date(localRow.updatedAt).getTime() : 0;
        const remoteTime = r.updated_at ? new Date(r.updated_at).getTime() : 0;
        if (!localRow || remoteTime > localTime) {
          local[r.client_id] = {
            id:        r.client_id,
            name:      r.name,
            icon:      r.icon,
            pinned:    !!r.pinned,
            books:     Array.isArray(r.books) ? r.books : [],
            createdAt: r.created_at,
            updatedAt: r.updated_at,
          };
          changed = true;
        }
      }
      if (changed) writeShelvesLocal(local);
    }
  }

  // ── Custom brackets
  {
    const { data, error } = await supabase
      .from("custom_brackets").select("*").eq("user_id", userId);
    if (error) { console.warn("[cloudSync] pull brackets", error); }
    else if (data) {
      const local = readBracketsLocal();
      const tomb  = new Set(tombs.custom_brackets || []);
      let changed = false;
      for (const r of data) {
        if (tomb.has(r.client_id)) continue;
        const localRow = local[r.client_id];
        const localTime  = localRow?.updatedAt ? new Date(localRow.updatedAt).getTime() : 0;
        const remoteTime = r.updated_at ? new Date(r.updated_at).getTime() : 0;
        if (!localRow || remoteTime > localTime) {
          local[r.client_id] = {
            id:        r.client_id,
            title:     r.title,
            year:      r.year,
            format:    r.format,
            size:      r.size,
            month:     r.month,
            presetId:  r.preset_id,
            pinned:    !!r.pinned,
            items:     Array.isArray(r.items) ? r.items : [],
            picks:     r.picks || {},
            winner:    r.winner || null,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
          };
          changed = true;
        }
      }
      if (changed) writeBracketsLocal(local);
    }
  }

  // ── Preferences (single row)
  {
    const { data, error } = await supabase
      .from("user_preferences").select("*").eq("user_id", userId).maybeSingle();
    if (error) { console.warn("[cloudSync] pull prefs", error); }
    else if (data) {
      const local = readPrefsLocal();
      const localTime  = local?.updatedAt ? new Date(local.updatedAt).getTime() : 0;
      const remoteTime = data.updated_at ? new Date(data.updated_at).getTime() : 0;
      if (remoteTime > localTime) {
        writePrefsLocal({
          genres:      Array.isArray(data.genres) ? data.genres : [],
          onboardedAt: data.onboarded_at,
          updatedAt:   data.updated_at,
        });
        if (data.goodreads_user_id) writeGoodreadsId(data.goodreads_user_id);
      }
    }
  }
}

// ── Push (local → remote) ──────────────────────────────────────────────────
async function pushUp() {
  if (!currentUser || !supabase) return;
  if (pushing) { dirty = true; return; }
  pushing = true;
  try {
    const userId = currentUser.id;
    const tombs  = readTombstones();

    // ── Shelves
    {
      const local = readShelvesLocal();
      const rows  = Object.values(local).map((s) => ({
        user_id:    userId,
        client_id:  s.id,
        name:       s.name,
        icon:       s.icon,
        pinned:     !!s.pinned,
        books:      s.books || [],
        created_at: s.createdAt,
        updated_at: s.updatedAt,
      }));
      if (rows.length) {
        const { error } = await supabase
          .from("shelves").upsert(rows, { onConflict: "user_id,client_id" });
        if (error) console.warn("[cloudSync] push shelves", error);
      }
      const ids = tombs.shelves || [];
      if (ids.length) {
        const { error } = await supabase
          .from("shelves").delete().eq("user_id", userId).in("client_id", ids);
        if (error) console.warn("[cloudSync] delete shelves", error);
      }
    }

    // ── Custom brackets
    {
      const local = readBracketsLocal();
      const rows  = Object.values(local).map((b) => ({
        user_id:    userId,
        client_id:  b.id,
        title:      b.title,
        year:       b.year ?? null,
        format:     b.format ?? null,
        size:       b.size ?? 8,
        month:      b.month ?? null,
        preset_id:  b.presetId ?? null,
        pinned:     !!b.pinned,
        items:      b.items || [],
        picks:      b.picks || {},
        winner:     b.winner ?? null,
        created_at: b.createdAt,
        updated_at: b.updatedAt,
      }));
      if (rows.length) {
        const { error } = await supabase
          .from("custom_brackets").upsert(rows, { onConflict: "user_id,client_id" });
        if (error) console.warn("[cloudSync] push brackets", error);
      }
      const ids = tombs.custom_brackets || [];
      if (ids.length) {
        const { error } = await supabase
          .from("custom_brackets").delete().eq("user_id", userId).in("client_id", ids);
        if (error) console.warn("[cloudSync] delete brackets", error);
      }
    }

    // ── Preferences
    {
      const prefs = readPrefsLocal();
      const grId  = readGoodreadsId();
      const row   = {
        user_id:           userId,
        genres:            Array.isArray(prefs.genres) ? prefs.genres : [],
        onboarded_at:      prefs.onboardedAt || null,
        goodreads_user_id: grId,
        updated_at:        prefs.updatedAt || new Date().toISOString(),
      };
      const { error } = await supabase
        .from("user_preferences").upsert(row, { onConflict: "user_id" });
      if (error) console.warn("[cloudSync] push prefs", error);
    }

    clearTombstones();
  } finally {
    pushing = false;
    if (dirty) {
      dirty = false;
      schedulePush();
    }
  }
}
