/**
 * multiplayerSync.js — Supabase IO for shared brackets + participations.
 *
 * Pure data layer.  Authentication state is implicit via the supabase
 * client — signed-in users hit the `authenticated` RLS role, signed-out
 * users hit `anon`.  Anonymous identity is provided by anonId.js.
 *
 * Functions
 * ─────────
 *   shareBracket(bracketId, settings)             → { share_code, ... }
 *   revokeShare(bracketId)                        → void
 *   updateShareSettings(bracketId, patch)         → updated row
 *   getBracketByShareCode(shareCode)              → bracket | null
 *   getMyParticipation(bracketId)                 → row | null
 *   joinBracket(bracketId, displayName)           → row
 *   savePicks(participationId, picks, opts?)      → updated row
 *   listParticipations(bracketId)                 → row[]
 *   countParticipations(bracketId)                → integer
 */

import { supabase } from "./supabase.js";
import { getAnonId, getAnonName } from "../shared/anonId.js";

// 10-char hex share_code → 1.1 trillion possibilities, retry on conflict
function generateShareCode() {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const bytes = new Uint8Array(5);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return Math.random().toString(16).slice(2, 12).padEnd(10, "0");
}

/**
 * Mark a bracket as shared, generating a share_code if one doesn't exist.
 * Idempotent — calling twice on the same bracket returns the same code.
 *
 * Accepts the FULL bracket object (not just its id) so we can upsert the
 * row when it isn't on the server yet.  This handles the just-created
 * bracket case where cloud-sync's debounced push hasn't fired.
 *
 * `settings` may include any of:
 *   show_participant_names, reveal_mode, allow_anonymous, voting_closes_at
 */
export async function shareBracket(bracket, settings = {}) {
  if (!supabase) throw new Error("Supabase not configured");
  if (!bracket?.id) throw new Error("shareBracket requires a bracket object");

  // Get the calling user — needed to satisfy the user_id NOT NULL column
  // when we have to upsert a brand-new row.
  const { data: { user } = {} } = await supabase.auth.getUser();
  if (!user) throw new Error("must be signed in to share a bracket");

  const patch = {};
  if (settings.show_participant_names !== undefined) patch.show_participant_names = !!settings.show_participant_names;
  if (settings.reveal_mode             !== undefined) patch.reveal_mode             = settings.reveal_mode;
  if (settings.allow_anonymous         !== undefined) patch.allow_anonymous         = !!settings.allow_anonymous;
  if (settings.voting_closes_at        !== undefined) patch.voting_closes_at        = settings.voting_closes_at;

  // Check if the bracket exists on the server already
  const { data: existing } = await supabase
    .from("custom_brackets")
    .select("id, share_code, show_participant_names, reveal_mode, allow_anonymous, voting_closes_at")
    .eq("id", bracket.id)
    .maybeSingle();

  // If already shared, just apply any settings patch and return
  if (existing?.share_code) {
    if (Object.keys(patch).length === 0) return existing;
    const { data, error } = await supabase
      .from("custom_brackets").update(patch).eq("id", bracket.id).select().single();
    if (error) throw error;
    return data;
  }

  // Not shared yet — assign a share_code with retry on rare collision
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateShareCode();
    const fullPayload = {
      id:         bracket.id,
      user_id:    user.id,
      client_id:  bracket.id,
      title:      bracket.title || "Untitled bracket",
      year:       bracket.year ?? null,
      format:     bracket.format ?? null,
      size:       bracket.size ?? 8,
      month:      bracket.month ?? null,
      preset_id:  bracket.presetId ?? null,
      pinned:     !!bracket.pinned,
      items:      bracket.items || [],
      picks:      bracket.picks || {},
      winner:     bracket.winner ?? null,
      created_at: bracket.createdAt,
      updated_at: bracket.updatedAt,
      share_code: code,
      ...patch,
    };
    // Upsert: updates the row if it exists, inserts otherwise.  Either
    // way the share_code is set on return.  conflict on the primary key.
    const { data, error } = await supabase
      .from("custom_brackets")
      .upsert(fullPayload, { onConflict: "id" })
      .select()
      .single();
    if (!error) return data;
    if (error.code !== "23505") throw error;        // not a unique violation
  }
  throw new Error("could not assign share_code (3 collisions)");
}

/** Disable the share link.  Existing participations remain in the DB. */
export async function revokeShare(bracketId) {
  if (!supabase) throw new Error("Supabase not configured");
  const { error } = await supabase
    .from("custom_brackets")
    .update({ share_code: null })
    .eq("id", bracketId);
  if (error) throw error;
}

/** Patch share settings without changing the share_code. */
export async function updateShareSettings(bracketId, patch) {
  if (!supabase) throw new Error("Supabase not configured");
  const allowed = ["show_participant_names", "reveal_mode", "allow_anonymous", "voting_closes_at"];
  const clean = {};
  for (const k of allowed) if (patch[k] !== undefined) clean[k] = patch[k];
  if (!Object.keys(clean).length) return null;
  const { data, error } = await supabase
    .from("custom_brackets").update(clean).eq("id", bracketId).select().single();
  if (error) throw error;
  return data;
}

/** Fetch a bracket by its public share_code.  Returns null when not found. */
export async function getBracketByShareCode(shareCode) {
  if (!supabase || !shareCode) return null;
  const { data, error } = await supabase
    .from("custom_brackets")
    .select("*")
    .eq("share_code", shareCode)
    .maybeSingle();
  if (error) {
    console.warn("[multiplayerSync] getBracketByShareCode", error);
    return null;
  }
  return data;
}

// ── Participations ─────────────────────────────────────────────────────────

/** Build the (user_id) or (anon_id) filter the current caller would use. */
function callerKey(userId) {
  if (userId) return { user_id: userId, anon_id: null };
  return { user_id: null, anon_id: getAnonId() };
}

/** Get the caller's participation row in this bracket, if any. */
export async function getMyParticipation(bracketId, userId = null) {
  if (!supabase) return null;
  const key = callerKey(userId);
  let q = supabase.from("bracket_participations").select("*").eq("bracket_id", bracketId);
  if (key.user_id) q = q.eq("user_id", key.user_id);
  else             q = q.eq("anon_id", key.anon_id).is("user_id", null);
  const { data, error } = await q.maybeSingle();
  if (error) {
    console.warn("[multiplayerSync] getMyParticipation", error);
    return null;
  }
  return data;
}

/**
 * Insert a participation row for this caller.  Idempotent: if the row
 * already exists, returns it (potentially updating display_name).
 */
export async function joinBracket(bracketId, displayName, userId = null) {
  if (!supabase) throw new Error("Supabase not configured");
  const existing = await getMyParticipation(bracketId, userId);
  const name = (displayName || getAnonName() || "Anonymous").trim().slice(0, 40);
  if (existing) {
    if (existing.display_name !== name) {
      const { data } = await supabase
        .from("bracket_participations")
        .update({ display_name: name })
        .eq("id", existing.id)
        .select()
        .single();
      return data || existing;
    }
    return existing;
  }
  const key = callerKey(userId);
  const row = {
    bracket_id:    bracketId,
    user_id:       key.user_id,
    anon_id:       key.anon_id,
    display_name:  name,
    picks:         {},
  };
  const { data, error } = await supabase
    .from("bracket_participations")
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Save the caller's picks for this participation.  Use `winner` + `complete`
 * when crowning the champion so we can timestamp completed_at.
 *
 * Anonymous calls always include the anon_id filter for write-safety even
 * though RLS does not strictly require it (see migration 010 header).
 */
export async function savePicks(participation, { picks, winner, complete } = {}) {
  if (!supabase || !participation?.id) return null;
  const patch = {};
  if (picks   !== undefined) patch.picks  = picks;
  if (winner  !== undefined) patch.winner = winner;
  if (complete) patch.completed_at = new Date().toISOString();
  if (!Object.keys(patch).length) return participation;

  let q = supabase.from("bracket_participations").update(patch).eq("id", participation.id);
  // Defence-in-depth: scope the update to caller's key
  if (participation.user_id) q = q.eq("user_id", participation.user_id);
  else if (participation.anon_id) q = q.eq("anon_id", participation.anon_id);
  const { data, error } = await q.select().single();
  if (error) {
    console.warn("[multiplayerSync] savePicks", error);
    return null;
  }
  return data;
}

/** All participation rows for a bracket (newest first). */
export async function listParticipations(bracketId) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("bracket_participations")
    .select("*")
    .eq("bracket_id", bracketId)
    .order("joined_at", { ascending: true });
  if (error) {
    console.warn("[multiplayerSync] listParticipations", error);
    return [];
  }
  return data || [];
}

/** Total participants in a bracket — quick badge counter. */
export async function countParticipations(bracketId) {
  if (!supabase) return 0;
  const { count, error } = await supabase
    .from("bracket_participations")
    .select("id", { count: "exact", head: true })
    .eq("bracket_id", bracketId);
  if (error) {
    console.warn("[multiplayerSync] countParticipations", error);
    return 0;
  }
  return count || 0;
}

// ── Aggregate results ──────────────────────────────────────────────────────

/**
 * Build a per-match vote tally from raw participations.
 *
 *   { matchId: { totalVotes, byBookId: { id: count, ... }, topBook } }
 *
 * Ignores participations whose picks haven't yet covered that match.
 */
export function tallyVotes(participations) {
  const tally = {};
  for (const p of participations || []) {
    const picks = p.picks || {};
    for (const [matchId, book] of Object.entries(picks)) {
      if (!book?.id) continue;
      if (!tally[matchId]) tally[matchId] = { totalVotes: 0, byBookId: {}, topBook: null };
      tally[matchId].totalVotes += 1;
      tally[matchId].byBookId[book.id] = (tally[matchId].byBookId[book.id] || 0) + 1;
    }
  }
  // Decide the leader for each match
  for (const m of Object.values(tally)) {
    let topId = null, topN = 0;
    for (const [bookId, n] of Object.entries(m.byBookId)) {
      if (n > topN) { topId = bookId; topN = n; }
    }
    m.topBookId = topId;
    m.topVotes  = topN;
  }
  return tally;
}

/**
 * Tally for the overall champion across all completed participations.
 *   { totalVoters, byBookId: { id: count }, topBookId, topVotes }
 */
export function tallyChampions(participations) {
  const out = { totalVoters: 0, byBookId: {}, topBookId: null, topVotes: 0 };
  for (const p of participations || []) {
    if (!p.winner?.id) continue;
    out.totalVoters += 1;
    out.byBookId[p.winner.id] = (out.byBookId[p.winner.id] || 0) + 1;
  }
  for (const [bookId, n] of Object.entries(out.byBookId)) {
    if (n > out.topVotes) { out.topVotes = n; out.topBookId = bookId; }
  }
  return out;
}
