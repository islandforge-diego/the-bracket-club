/**
 * roundRobin.js — round-robin bracket helpers.
 *
 * In a round-robin every item plays every other item exactly once.
 * Champion is whoever ends with the most wins (ties broken by head-to-head,
 * then by original order).
 *
 * Match IDs are positional (`rr_<i>_<j>` with i < j) so picks survive a
 * re-render and stay stable across reloads.  Items must be passed in a
 * stable order — the seed pipeline uses applySeeding() upstream so this
 * file doesn't need to know about ratings.
 */

/**
 * Generate every unique pairing.  N items → N*(N-1)/2 matches.
 *
 * @param {Array} items
 * @returns {Array<{ id: string, a: any, b: any, i: number, j: number }>}
 */
export function buildRoundRobin(items) {
  const matches = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      matches.push({ id: `rr_${i}_${j}`, a: items[i], b: items[j], i, j });
    }
  }
  return matches;
}

/**
 * Tally wins per item and rank by wins desc.  Ties resolved by head-to-head
 * (the item that beat the other in the direct match wins the tiebreak), then
 * by original order so results are deterministic.
 *
 * @param {Array}  items   The items in the same order they were passed to
 *                         buildRoundRobin (positions matter for match IDs)
 * @param {Object} picks   Map of matchId → winner book (whatever shape the
 *                         caller stores; we compare by item.id)
 * @returns {Array<{ item, wins, played, rank }>} sorted high → low
 */
export function computeStandings(items, picks) {
  const matches = buildRoundRobin(items);
  const totalGames = items.length - 1;

  const stats = items.map((item, idx) => ({
    item, idx, wins: 0, played: 0, total: totalGames,
  }));

  // Tally wins + games played
  for (const m of matches) {
    const pick = picks[m.id];
    if (!pick) continue;
    stats[m.i].played++;
    stats[m.j].played++;
    if      (pick.id === m.a?.id) stats[m.i].wins++;
    else if (pick.id === m.b?.id) stats[m.j].wins++;
  }

  // Head-to-head tiebreak: among items with equal wins, the one who beat
  // the other in their direct match wins the tiebreak.
  const headToHeadWinner = (idxA, idxB) => {
    const lo = Math.min(idxA, idxB), hi = Math.max(idxA, idxB);
    const pick = picks[`rr_${lo}_${hi}`];
    if (!pick) return 0;
    if (pick.id === items[idxA]?.id) return -1;       // a wins tiebreak
    if (pick.id === items[idxB]?.id) return  1;       // b wins tiebreak
    return 0;
  };

  const sorted = [...stats].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    const h2h = headToHeadWinner(a.idx, b.idx);
    if (h2h !== 0) return h2h;
    return a.idx - b.idx;
  });

  return sorted.map((s, i) => ({ ...s, rank: i + 1 }));
}

/**
 * Has the round-robin reached a definitive champion?
 * True when the leader has more wins than the second place AND the leader
 * has played all their games.  The intermediate state where one item is
 * mathematically eliminated still allows other matches to matter.
 */
export function isRoundRobinComplete(standings) {
  if (standings.length < 2) return false;
  const leader = standings[0];
  const second = standings[1];
  return leader.played === leader.total && leader.wins > second.wins;
}

/**
 * Total matches played vs total possible.  Useful for progress chips.
 */
export function roundRobinProgress(items, picks) {
  const total = items.length * (items.length - 1) / 2;
  let done = 0;
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (picks[`rr_${i}_${j}`]) done++;
    }
  }
  return { done, total };
}
