/**
 * RoundRobinView — replaces the knockout overview when the active bracket
 * format is `round_robin`.  Renders:
 *
 *   • A standings table at the top (rank · cover · title · "X / Y wins")
 *   • A grid of all matches.  Played matches show the winner; unplayed
 *     matches show "vs" between the two contenders and are tappable to
 *     enter the 1v1 picker.
 *
 * The 1v1 picker is rendered inline by this component too — it reuses the
 * same swipe-to-pick + auto-advance feel as the knockout bracket but lives
 * here to keep round-robin self-contained.
 *
 * Props
 *   items       Array of book objects to compete (already seeded if applicable)
 *   picks       Map of matchId → winner book
 *   onVote      (matchId, book) => void — caller persists to data
 *   onChampion  (championBook) => void — caller sets m.winner + fires VictoryScreen
 *   onReset     () => void
 */

import { useState, useRef } from "react";
import Cover from "./Cover.jsx";
import { buildRoundRobin, computeStandings, roundRobinProgress, isRoundRobinComplete } from "./roundRobin.js";
import { playUI, playBattleStart, startSwipeTone, updateSwipeTone, stopSwipeTone } from "./soundscape.js";

export default function RoundRobinView({ items, picks, onVote, onChampion, onReset, monthLabel }) {
  const [activeMatchId, setActiveMatchId] = useState(null);
  const [swipeDx, setSwipeDx] = useState(0);
  const swipeStart = useRef(null);

  const matches    = buildRoundRobin(items);
  const standings  = computeStandings(items, picks);
  const progress   = roundRobinProgress(items, picks);
  const complete   = isRoundRobinComplete(standings);

  // Side effect: when round-robin finishes, declare champion via callback.
  // useEffect avoided — the parent re-renders on every pick so this fires
  // synchronously the same render that completes the bracket.
  if (complete && !picks._championDeclared) {
    // Mark via a sentinel pick key so we don't fire onChampion repeatedly.
    // (The caller is expected to also detect the change via m.winner.)
    setTimeout(() => onChampion?.(standings[0].item), 0);
  }

  // ── Active 1v1 picker ──────────────────────────────────────────────
  if (activeMatchId) {
    const match = matches.find((m) => m.id === activeMatchId);
    if (!match) { setActiveMatchId(null); return null; }
    const winner = picks[match.id];

    const swipeAmount = Math.abs(swipeDx) / 120;
    const targetA = swipeDx < -8;
    const targetB = swipeDx > 8;

    const onTouchStart = (e) => { if (winner) return; swipeStart.current = e.touches[0].clientX; };
    const onTouchMove  = (e) => {
      if (winner || swipeStart.current == null) return;
      const dx = e.touches[0].clientX - swipeStart.current;
      setSwipeDx(Math.max(-120, Math.min(120, dx)));
      if (Math.abs(dx) > 10) {
        startSwipeTone();
        updateSwipeTone(dx / 120);
      }
    };
    const onTouchEnd = (e) => {
      if (winner || swipeStart.current == null) return;
      const dx = e.changedTouches[0].clientX - swipeStart.current;
      swipeStart.current = null;
      setSwipeDx(0);
      stopSwipeTone();
      if (Math.abs(dx) > 80) {
        const pick = dx < 0 ? match.a : match.b;
        if (pick) doVote(match.id, pick);
      }
    };

    const doVote = (id, book) => {
      onVote(id, book);
      playUI("commit");
      // Auto-advance to next unplayed match (or back to overview if done)
      const nextUnplayed = matches.find((mt) => mt.id !== id && !picks[mt.id]);
      setTimeout(() => { if (nextUnplayed) playUI("next"); setActiveMatchId(nextUnplayed?.id || null); }, 650);
    };

    return (
      <div style={{ padding:16, display:"flex", flexDirection:"column", gap:16 }}>
        <button onClick={() => setActiveMatchId(null)}
          style={{ background:"none", border:"none", color:"#15803d", fontWeight:700, fontSize:13, cursor:"pointer", display:"flex", alignItems:"center", gap:4, padding:0 }}>
          ‹ Back to standings
        </button>
        <div key={`label-${match.id}`} style={{ textAlign:"center", animation: "bc-battle-label-fade 380ms ease-out backwards" }}>
          <div style={{ fontSize:11, color:"#9ca3af", textTransform:"uppercase", letterSpacing:2 }}>Match {progress.done + (winner ? 0 : 1)} of {progress.total}</div>
          <div style={{ fontWeight:800, fontSize:20, color:"#1c1917", marginTop:4 }}>Pick the Winner</div>
          <div style={{ fontSize:10, color:"#d6d3d1", marginTop:4 }}>Tap a card or swipe toward your pick</div>
        </div>
        <div
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          style={{ display:"flex", gap:12, position:"relative", touchAction:"pan-y" }}
        >
          {[match.a, match.b].map((book, i) => {
            const isA      = i === 0;
            const won      = winner?.id === book?.id;
            const lost     = winner && !won;
            const targeted = (isA && targetA) || (!isA && targetB);
            const dimmed   = (isA && targetB) || (!isA && targetA);
            const scale    = won ? 1.04 : lost ? 0.96 : targeted ? 1 + 0.08 * swipeAmount : dimmed ? 1 - 0.04 * swipeAmount : 1;
            const opacity  = won ? 1 : lost ? 0.45 : dimmed ? 1 - 0.4 * swipeAmount : 1;
            const border   = won ? "#22c55e" : targeted ? "#22c55e" : "#e7e5e4";
            return (
              <div key={`${match.id}-${i}`} style={{ flex:1, animation: `${isA ? "bc-battle-card-left" : "bc-battle-card-right"} 450ms ${isA ? 0 : 200}ms cubic-bezier(.34,1.56,.64,1) backwards` }}>
                <button onClick={() => doVote(match.id, book)}
                  style={{ width:"100%", border:`2px solid ${border}`, borderRadius:18, padding:"16px 10px", display:"flex", flexDirection:"column", alignItems:"center", gap:10, background:won?"#f0fdf4":lost?"#fafaf9":targeted?"#f0fdf4":"#fff", transform:`scale(${scale})`, opacity, boxShadow:(won||targeted)?"0 4px 20px #22c55e44":"0 1px 4px #0001", transition: swipeStart.current ? "background 0.1s, border-color 0.1s" : "all .2s", cursor:"pointer" }}>
                  <Cover book={book} size="lg" />
                  <div style={{ textAlign:"center" }}>
                    <div style={{ fontWeight:800, fontSize:13, color:"#1c1917" }}>{book?.title}</div>
                    {book?.author && <div style={{ fontSize:11, color:"#78716c", marginTop:2 }}>{book.author}</div>}
                    {book?.rating && <div style={{ fontSize:12, color:"#f59e0b", marginTop:3, letterSpacing:1 }}>{"★".repeat(book.rating)}{"☆".repeat(5 - book.rating)}</div>}
                  </div>
                  {won && <span style={{ fontSize:22 }}>🏆</span>}
                </button>
              </div>
            );
          })}
          <div key={`vs-${match.id}`} style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", background:"#14532d", color:"#fff", borderRadius:99, width:30, height:30, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:800, boxShadow:"0 2px 8px #14532d66", zIndex:5, pointerEvents:"none", animation:"bc-battle-vs-pop 450ms 350ms cubic-bezier(.34,1.56,.64,1) backwards" }}>VS</div>
        </div>
      </div>
    );
  }

  // ── Overview: standings + match grid ───────────────────────────────
  return (
    <div style={{ padding:16, display:"flex", flexDirection:"column", gap:16 }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:11, color:"#9ca3af", textTransform:"uppercase", letterSpacing:2 }}>Round-robin</div>
        <div style={{ fontWeight:800, fontSize:18, color:"#1c1917", marginTop:2 }}>{monthLabel} — every book vs every other</div>
        <div style={{ fontSize:12, color:"#9ca3af", marginTop:4 }}>{progress.done} / {progress.total} matches played</div>
      </div>

      {progress.done > 0 && (
        <div style={{ display:"flex", justifyContent:"flex-end" }}>
          <button onClick={onReset}
            style={{ padding:"6px 12px", background:"#fff", border:"1px solid #e7e5e4", borderRadius:8, fontSize:12, fontWeight:700, color:"#dc2626", cursor:"pointer" }}>
            Reset
          </button>
        </div>
      )}

      {/* Standings */}
      <div style={{ background:"#fff", borderRadius:14, boxShadow:"0 1px 4px #0001", overflow:"hidden" }}>
        <div style={{ padding:"10px 14px", background:"#f0fdf4", borderBottom:"1px solid #dcfce7", fontSize:11, fontWeight:800, color:"#15803d", textTransform:"uppercase", letterSpacing:1 }}>
          Standings
        </div>
        {standings.map((s) => (
          <div key={s.item.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", borderTop:"1px solid #f5f5f4" }}>
            <div style={{ width:22, textAlign:"center", fontWeight:800, fontSize:13, color: s.rank === 1 ? "#fbbf24" : "#9ca3af" }}>
              {s.rank === 1 ? "🥇" : s.rank === 2 ? "🥈" : s.rank === 3 ? "🥉" : `#${s.rank}`}
            </div>
            <Cover book={s.item} size="xs" />
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontWeight:700, fontSize:13, color:"#1c1917", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.item.title}</div>
              {s.item.author && <div style={{ fontSize:11, color:"#78716c" }}>{s.item.author}</div>}
            </div>
            <div style={{ fontWeight:800, fontSize:13, color: s.wins > 0 ? "#15803d" : "#a8a29e" }}>
              {s.wins} <span style={{ fontWeight:500, fontSize:11, color:"#a8a29e" }}>/ {s.total}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Match grid */}
      <div style={{ background:"#fff", borderRadius:14, boxShadow:"0 1px 4px #0001", overflow:"hidden" }}>
        <div style={{ padding:"10px 14px", background:"#fafaf9", borderBottom:"1px solid #f5f5f4", fontSize:11, fontWeight:800, color:"#78716c", textTransform:"uppercase", letterSpacing:1 }}>
          Matches
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(135px, 1fr))", gap:8, padding:10 }}>
          {matches.map((m) => {
            const winner = picks[m.id];
            const loserId = winner ? (winner.id === m.a?.id ? m.b?.id : m.a?.id) : null;
            return (
              <button key={m.id} onClick={() => { if (!picks[m.id]) playBattleStart(); else playUI("tap"); setActiveMatchId(m.id); }}
                style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4, padding:"8px 4px", background: winner ? "#f0fdf4" : "#fff", border: `2px solid ${winner ? "#22c55e" : "#e7e5e4"}`, borderRadius:10, cursor:"pointer", transition:"all .2s" }}>
                {winner ? (
                  <>
                    <div style={{ fontSize:9, fontWeight:800, color:"#15803d", textTransform:"uppercase", letterSpacing:1 }}>Winner</div>
                    <Cover book={winner} size="xs" />
                    <div style={{ fontSize:10, fontWeight:700, color:"#15803d", textAlign:"center", lineHeight:1.2, maxWidth:120, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {winner.title}
                    </div>
                    <div style={{ fontSize:8, color:"#a8a29e" }}>def. {(loserId === m.a?.id ? m.a : m.b)?.title?.slice(0, 18)}</div>
                  </>
                ) : (
                  <>
                    <div style={{ display:"flex", gap:4, alignItems:"center" }}>
                      <Cover book={m.a} size="xs" />
                      <span style={{ fontSize:9, fontWeight:800, color:"#14532d" }}>vs</span>
                      <Cover book={m.b} size="xs" />
                    </div>
                    <div style={{ fontSize:9, fontWeight:700, color:"#78716c", marginTop:2 }}>⚔️ Battle</div>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
