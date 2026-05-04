/**
 * CustomBracketView — runs a catalog (custom) bracket.
 *
 * Routes based on the bracket's saved format:
 *   round_robin                      → RoundRobinView
 *   single_elim / seeded_by_rating   → DynamicKnockoutView (built inline)
 *
 * Picks/winner persist via updateCustomBracket().  When the bracket finishes,
 * VictoryScreen fires and the winner is stored on the bracket so the hub
 * list can show the champion.
 *
 * The knockout view is a streamlined version of the monthly-bracket overview
 * — same buildBracket() helper, same swipe-to-pick 1v1 picker, same auto-
 * advance logic.  Kept inline (rather than extracting from Month) so the
 * existing shelf flow doesn't change shape.
 */

import { useState, useEffect, useRef } from "react";
import Cover from "./Cover.jsx";
import VictoryScreen from "./VictoryScreen.jsx";
import RoundRobinView from "./RoundRobinView.jsx";
import ItemSearch from "./ItemSearch.jsx";
import { buildBracket, getBracketWinner } from "./bracket.js";
import { playUI, playBattleStart, startSwipeTone, updateSwipeTone, stopSwipeTone, setScale, resetScale, playStar } from "./soundscape.js";
import { applySeeding, DEFAULT_FORMAT, getFormat } from "./bracketFormats.js";
import { getCustomBracket, updateCustomBracket, deleteCustomBracket } from "./customBrackets.js";
import { searchBooks } from "../categories/books/data.js";
import { FULL } from "./constants.js";

// Map our catalog genres to scale moods.  The dominant genre in the bracket's
// items decides the scale while the user is inside the bracket — so a horror
// bracket plays in minor, a sci-fi bracket in lydian, etc.  Mapping is
// intentionally limited to genres where the mood swap is musically obvious;
// everything else falls back to major.
const GENRE_TO_SCALE = {
  "horror":          "minor",
  "mystery":         "minor",
  "thriller":        "harmonic_minor",
  "science fiction": "lydian",
  "fantasy":         "mixolydian",
};

function dominantGenre(items) {
  const counts = {};
  for (const it of items || []) {
    for (const g of (it.genres || [])) counts[g] = (counts[g] || 0) + 1;
  }
  let max = null, maxN = 0;
  for (const [g, n] of Object.entries(counts)) {
    if (n > maxN) { max = g; maxN = n; }
  }
  return max;
}

export default function CustomBracketView({ bracketId, onBack }) {
  const [bracket, setBracket]       = useState(() => getCustomBracket(bracketId));
  const [activeMatchId, setActiveMatchId] = useState(null);
  const [showVictory,   setShowVictory]   = useState(false);
  const prevWinnerRef = useRef(bracket?.winner);
  const [swipeDx, setSwipeDx] = useState(0);
  const swipeStart = useRef(null);

  // Refresh from storage on mount in case another tab/component edited it
  useEffect(() => {
    setBracket(getCustomBracket(bracketId));
  }, [bracketId]);

  // Match the soundscape's scale to the bracket's dominant genre for as long
  // as the user is inside this bracket — horror plays in minor, sci-fi in
  // lydian, etc.  Reverts to major on unmount.
  useEffect(() => {
    const dom = dominantGenre(bracket?.items);
    const scale = dom && GENRE_TO_SCALE[dom];
    if (scale) setScale(scale);
    return () => resetScale();
  }, [bracket?.id]);

  // Trigger victory once when winner transitions null → set
  useEffect(() => {
    if (!prevWinnerRef.current && bracket?.winner) {
      setShowVictory(true);
    }
    prevWinnerRef.current = bracket?.winner;
  }, [bracket?.winner?.id]);

  if (!bracket) {
    return (
      <div style={{ padding: 16, textAlign: "center", color: "#9ca3af" }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: "#15803d", fontWeight: 700, fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 8 }}>
          ‹ Back
        </button>
        <div>This bracket no longer exists.</div>
      </div>
    );
  }

  const items = applySeeding(bracket.items, bracket.format || DEFAULT_FORMAT);
  const size  = bracket.size || bracket.items.length || 8;
  const needsBooks = (bracket.items?.length || 0) < size;

  const persist = (patch) => {
    const next = updateCustomBracket(bracketId, patch);
    if (next) setBracket(next);
  };

  const onVote = (matchId, book) => {
    const newPicks = { ...bracket.picks, [matchId]: book };
    persist({ picks: newPicks });
  };

  const onChampion = (champ) => {
    if (bracket.winner?.id === champ.id) return;
    persist({ winner: champ });
  };

  const onResetBracket = () => {
    if (!confirm("Reset this bracket's picks?")) return;
    persist({ picks: {}, winner: null });
    prevWinnerRef.current = null;
  };

  const onDelete = () => {
    if (!confirm("Delete this bracket forever?")) return;
    deleteCustomBracket(bracketId);
    onBack?.();
  };

  // ── Add / remove books while collecting ───────────────────────────────
  const addBook = (book) => {
    if (!book?.title?.trim()) return;
    if ((bracket.items?.length || 0) >= size) return;
    const newBook = {
      id:            `bk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title:         book.title.trim(),
      author:        (book.author || "").trim(),
      cover:         (book.cover  || "").trim(),
      googleBooksId: book.googleBooksId || null,
      isbn13:        book.isbn13 || null,
      description:   book.description || null,
      genres:        book.genres || [],
      rating:        null,
    };
    persist({ items: [...bracket.items, newBook] });
    playStar();                                          // little sparkle on add
  };

  const removeBook = (id) => {
    persist({ items: bracket.items.filter((b) => b.id !== id) });
    playUI("back");
  };

  // ── Header (shared across format branches) ───────────────────────────
  const Header = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "#fff", borderBottom: "1px solid #e7e5e4" }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: "#15803d", fontWeight: 700, fontSize: 13, cursor: "pointer", padding: 0 }}>
        ‹ Back
      </button>
      <div style={{ flex: 1, textAlign: "center", minWidth: 0, padding: "0 8px" }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: "#1c1917", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {bracket.title}
        </div>
        <div style={{ fontSize: 10, color: "#9ca3af" }}>
          {bracket.year} · {bracket.items.length} books · {bracket.format}
        </div>
      </div>
      <button onClick={onDelete} style={{ background: "none", border: "none", color: "#dc2626", fontSize: 11, cursor: "pointer", padding: "4px 6px", fontWeight: 700 }}>
        🗑️
      </button>
    </div>
  );

  const victoryOverlay = showVictory && bracket.winner && (
    <VictoryScreen
      book={bracket.winner}
      title={bracket.title}
      subtitle={`Champion of ${bracket.year}`}
      onClose={() => setShowVictory(false)}
    />
  );

  // ── COLLECT-BOOKS mode (bracket isn't full yet) ──────────────────────
  // Mirrors the existing per-month "add books you read" pattern: ItemSearch
  // bar at top, list of currently-added books, manual entry escape hatch.
  // When items.length === size, this branch falls through and the bracket
  // renders as normal.
  if (needsBooks) {
    const monthLabel = bracket.month != null ? `${FULL[bracket.month]} ${bracket.year}` : null;
    return (
      <>
        {Header}
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 2 }}>
              Add books · {getFormat(bracket.format).label}
            </div>
            <div style={{ fontWeight: 800, fontSize: 18, color: "#1c1917", marginTop: 4 }}>
              {bracket.items.length} of {size} books added
            </div>
            {monthLabel && (
              <div style={{ fontSize: 12, color: "#15803d", marginTop: 2 }}>📅 {monthLabel}</div>
            )}
          </div>

          {/* Search bar — Google Books–backed */}
          <ItemSearch
            placeholder="Search for a book to add…"
            searchFn={searchBooks}
            onSelect={addBook}
            onManual={() => {
              const title = window.prompt("Book title?");
              if (!title) return;
              const author = window.prompt("Author? (optional)") || "";
              addBook({ title, author, cover: "" });
            }}
          />

          {/* Currently-added books */}
          {bracket.items.length === 0 ? (
            <div style={{ background: "#fff", borderRadius: 14, padding: "28px 16px", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
              <div style={{ fontSize: 32, marginBottom: 6 }}>📚</div>
              Search above to add books to your bracket.
            </div>
          ) : (
            <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 1px 4px #0001", overflow: "hidden" }}>
              {bracket.items.map((b, i) => (
                <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderTop: i ? "1px solid #f5f5f4" : "none" }}>
                  <div style={{ width: 22, textAlign: "center", fontWeight: 800, fontSize: 13, color: "#9ca3af" }}>{i + 1}</div>
                  <Cover book={b} size="xs" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#1c1917", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.title}</div>
                    {b.author && <div style={{ fontSize: 11, color: "#78716c" }}>{b.author}</div>}
                  </div>
                  <button onClick={() => removeBook(b.id)}
                    style={{ background: "none", border: "none", color: "#dc2626", fontSize: 16, cursor: "pointer", padding: "4px 8px" }}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Footer hint */}
          <div style={{ textAlign: "center", color: "#9ca3af", fontSize: 12, padding: "8px 0" }}>
            {size - bracket.items.length === 0
              ? "Bracket is ready — open it to start picking!"
              : `Add ${size - bracket.items.length} more to start the bracket.`}
          </div>

          {/* Delete option for empty / partly-filled brackets */}
          <button onClick={onDelete}
            style={{ width: "100%", padding: 10, background: "transparent", border: "none", color: "#dc2626", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            🗑️  Delete this bracket
          </button>
        </div>
      </>
    );
  }

  // ── ROUND-ROBIN branch ───────────────────────────────────────────────
  if (bracket.format === "round_robin") {
    return (
      <>
        {victoryOverlay}
        {Header}
        <RoundRobinView
          items={items}
          picks={bracket.picks}
          onVote={onVote}
          onChampion={onChampion}
          onReset={onResetBracket}
          monthLabel={bracket.title}
        />
      </>
    );
  }

  // ── KNOCKOUT branch (single_elim / seeded_by_rating) ─────────────────
  const built = buildBracket(items);
  const rounds = built.rounds;

  // Active 1v1 picker
  if (activeMatchId) {
    const match = rounds.flat().find((mt) => mt.id === activeMatchId);
    if (!match) { setActiveMatchId(null); return null; }
    const contenders = [];
    if (match.a !== undefined) {
      contenders.push(match.a, match.b);
      if (match.c) contenders.push(match.c);
    } else {
      if (match.feedA) { const w = getBracketWinner(match.feedA, rounds, bracket.picks); if (w) contenders.push(w); }
      if (match.feedB) { const w = getBracketWinner(match.feedB, rounds, bracket.picks); if (w) contenders.push(w); }
      if (match.feedC) { const w = getBracketWinner(match.feedC, rounds, bracket.picks); if (w) contenders.push(w); }
    }
    const winner   = bracket.picks[match.id];
    const isFinal  = rounds[rounds.length - 1].some((mt) => mt.id === match.id);
    const isTriple = contenders.length === 3;

    const swipeAmount = Math.abs(swipeDx) / 120;
    const targetA = !isTriple && swipeDx < -8;
    const targetB = !isTriple && swipeDx > 8;

    const onTouchStart = (e) => { if (winner || isTriple) return; swipeStart.current = e.touches[0].clientX; };
    const onTouchMove  = (e) => {
      if (winner || isTriple || swipeStart.current == null) return;
      const dx = e.touches[0].clientX - swipeStart.current;
      setSwipeDx(Math.max(-120, Math.min(120, dx)));
      if (Math.abs(dx) > 10) {
        startSwipeTone();
        updateSwipeTone(dx / 120);
      }
    };
    const onTouchEnd = (e) => {
      if (winner || isTriple || swipeStart.current == null) return;
      const dx = e.changedTouches[0].clientX - swipeStart.current;
      swipeStart.current = null;
      setSwipeDx(0);
      stopSwipeTone();
      if (Math.abs(dx) > 80) {
        const t = dx < 0 ? contenders[0] : contenders[1];
        if (t) doVote(match.id, t);
      }
    };

    const doVote = (id, book) => {
      onVote(id, book);
      playUI("commit");
      // Detect final-round completion → crown champion
      if (isFinal) {
        const newPicks = { ...bracket.picks, [id]: book };
        const champ = getBracketWinner(rounds[rounds.length - 1][0].id, rounds, newPicks);
        if (champ) onChampion(champ);
      }
      // Auto-advance: find next ready unplayed match
      const next = nextReadyMatchId(rounds, { ...bracket.picks, [id]: book }, id);
      setTimeout(() => { if (next) playUI("next"); setActiveMatchId(next); }, 650);
    };

    return (
      <>
        {victoryOverlay}
        {Header}
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
          <button onClick={() => setActiveMatchId(null)}
            style={{ background: "none", border: "none", color: "#15803d", fontWeight: 700, fontSize: 13, cursor: "pointer", padding: 0 }}>
            ‹ Back to bracket
          </button>
          <div key={`label-${match.id}`} style={{ textAlign: "center", animation: "bc-battle-label-fade 380ms ease-out backwards" }}>
            <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 2 }}>{isFinal ? "Final" : `Round ${roundNumOf(rounds, match.id)}`}</div>
            <div style={{ fontWeight: 800, fontSize: 20, color: "#1c1917", marginTop: 4 }}>Pick the Winner</div>
            {!isTriple && <div style={{ fontSize: 10, color: "#d6d3d1", marginTop: 4 }}>Tap a card or swipe toward your pick</div>}
          </div>
          <div
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            style={{ display: "flex", gap: isTriple ? 8 : 12, position: "relative", touchAction: "pan-y" }}
          >
            {contenders.filter(Boolean).map((book, i) => {
              const isB1 = i === 0;
              const isLast = i === contenders.length - 1;
              const won  = winner?.id === book?.id;
              const lost = winner && !won;
              const targeted = !isTriple && ((isB1 && targetA) || (!isB1 && targetB));
              const dimmed   = !isTriple && ((isB1 && targetB) || (!isB1 && targetA));
              const scale    = won ? 1.04 : lost ? 0.96 : targeted ? 1 + 0.08 * swipeAmount : dimmed ? 1 - 0.04 * swipeAmount : 1;
              const opacity  = won ? 1 : lost ? 0.45 : dimmed ? 1 - 0.4 * swipeAmount : 1;
              const border   = won ? "#22c55e" : targeted ? "#22c55e" : "#e7e5e4";
              const animName = isB1 ? "bc-battle-card-left" : "bc-battle-card-right";
              const animDelay = isB1 ? 0 : (isTriple && !isLast ? 130 : 200);
              return (
                <div key={`${match.id}-${i}`} style={{ flex: 1, animation: `${animName} 450ms ${animDelay}ms cubic-bezier(.34,1.56,.64,1) backwards` }}>
                  <button onClick={() => doVote(match.id, book)}
                    style={{ width: "100%", border: `2px solid ${border}`, borderRadius: 18, padding: isTriple ? "12px 6px" : "16px 10px", display: "flex", flexDirection: "column", alignItems: "center", gap: isTriple ? 6 : 10, background: won ? "#f0fdf4" : lost ? "#fafaf9" : targeted ? "#f0fdf4" : "#fff", transform: `scale(${scale})`, opacity, boxShadow: (won || targeted) ? "0 4px 20px #22c55e44" : "0 1px 4px #0001", transition: swipeStart.current ? "background 0.1s, border-color 0.1s" : "all .2s", cursor: "pointer" }}>
                    <Cover book={book} size="lg" />
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontWeight: 800, fontSize: 13, color: "#1c1917" }}>{book?.title}</div>
                      {book?.author && <div style={{ fontSize: 11, color: "#78716c", marginTop: 2 }}>{book.author}</div>}
                    </div>
                    {won && <span style={{ fontSize: 22 }}>🏆</span>}
                  </button>
                </div>
              );
            })}
            <div key={`vs-${match.id}`} style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", background: "#14532d", color: "#fff", borderRadius: 99, width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, boxShadow: "0 2px 8px #14532d66", zIndex: 5, pointerEvents: "none", animation: "bc-battle-vs-pop 450ms 350ms cubic-bezier(.34,1.56,.64,1) backwards" }}>VS</div>
          </div>
        </div>
      </>
    );
  }

  // Knockout overview — rounds list
  return (
    <>
      {victoryOverlay}
      {Header}
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
        {Object.keys(bracket.picks).length > 0 && (
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button onClick={onResetBracket}
              style={{ padding: "6px 12px", background: "#fff", border: "1px solid #e7e5e4", borderRadius: 8, fontSize: 12, fontWeight: 700, color: "#dc2626", cursor: "pointer" }}>
              Reset
            </button>
          </div>
        )}

        {rounds.map((round, ri) => {
          const isFinal = ri === rounds.length - 1;
          const label = isFinal ? "Final" : `Round ${ri + 1}`;
          return (
            <div key={ri} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 2, textAlign: "center" }}>{label}</div>
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(round.length, 4)}, 1fr)`, gap: 8 }}>
                {round.map((match) => {
                  const winner = bracket.picks[match.id];
                  const contenders = [];
                  if (match.a !== undefined) {
                    contenders.push(match.a, match.b);
                    if (match.c) contenders.push(match.c);
                  } else {
                    if (match.feedA) { const w = getBracketWinner(match.feedA, rounds, bracket.picks); if (w) contenders.push(w); }
                    if (match.feedB) { const w = getBracketWinner(match.feedB, rounds, bracket.picks); if (w) contenders.push(w); }
                    if (match.feedC) { const w = getBracketWinner(match.feedC, rounds, bracket.picks); if (w) contenders.push(w); }
                  }
                  const needed = match.a !== undefined ? (match.c ? 3 : 2) : (match.feedC ? 3 : 2);
                  const ready  = contenders.length === needed && !winner;
                  const locked = !winner && !ready;
                  const canClick = ready || !!winner;
                  return (
                    <button key={match.id} onClick={() => { if (canClick) { if (ready) playBattleStart(); else playUI("tap"); setActiveMatchId(match.id); } }}
                      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "10px 4px", background: winner ? "#f0fdf4" : "#fff", border: locked ? "2px dashed #e7e5e4" : `2px solid ${winner ? "#22c55e" : "#e7e5e4"}`, borderRadius: 12, cursor: canClick ? "pointer" : "default", opacity: locked ? 0.4 : 1, transition: "all .2s" }}>
                      {winner ? (
                        <>
                          <Cover book={winner} size="xs" />
                          <div style={{ fontSize: 9, fontWeight: 700, color: "#15803d", lineHeight: 1.2, textAlign: "center", maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{winner.title}</div>
                        </>
                      ) : ready ? (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                            {contenders.map((book, ci) => (
                              <div key={book.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                {ci > 0 && <span style={{ fontSize: 9, fontWeight: 800, color: "#78716c" }}>vs</span>}
                                <Cover book={book} size="xs" />
                              </div>
                            ))}
                          </div>
                          <div style={{ fontSize: 8, fontWeight: 700, color: "#78716c" }}>⚔️ Battle</div>
                        </div>
                      ) : (
                        <div style={{ fontSize: 11, color: "#d6d3d1", padding: "8px 0" }}>🔒</div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {bracket.winner && (
          <div style={{ background: "linear-gradient(135deg,#166534,#14532d)", borderRadius: 18, padding: 16, textAlign: "center", color: "#fff" }}>
            <div style={{ fontSize: 10, opacity: .65, textTransform: "uppercase", letterSpacing: 2, marginBottom: 6 }}>Champion</div>
            <Cover book={bracket.winner} size="lg" />
            <div style={{ fontWeight: 800, fontSize: 16, marginTop: 8 }}>{bracket.winner.title}</div>
            {bracket.winner.author && <div style={{ fontSize: 12, opacity: .7, marginTop: 2 }}>{bracket.winner.author}</div>}
          </div>
        )}
      </div>
    </>
  );
}

// ── helpers (knockout) ──────────────────────────────────────────────────────
function nextReadyMatchId(rounds, picks, skipId) {
  for (const round of rounds) {
    for (const match of round) {
      if (match.id === skipId || picks[match.id]) continue;
      const contenders = [];
      if (match.a !== undefined) {
        contenders.push(match.a, match.b);
        if (match.c) contenders.push(match.c);
      } else {
        if (match.feedA) { const w = getBracketWinner(match.feedA, rounds, picks); if (w) contenders.push(w); }
        if (match.feedB) { const w = getBracketWinner(match.feedB, rounds, picks); if (w) contenders.push(w); }
        if (match.feedC) { const w = getBracketWinner(match.feedC, rounds, picks); if (w) contenders.push(w); }
      }
      const needed = match.a !== undefined ? (match.c ? 3 : 2) : (match.feedC ? 3 : 2);
      if (contenders.length === needed) return match.id;
    }
  }
  return null;
}

function roundNumOf(rounds, matchId) {
  for (let i = 0; i < rounds.length; i++) {
    if (rounds[i].some((m) => m.id === matchId)) return i + 1;
  }
  return 1;
}
