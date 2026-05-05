/**
 * SharedBracketView — public-route view for a shared bracket.
 *
 * Mounted at /b/:shareCode.  Anyone (signed-in or anonymous) lands here
 * and either:
 *   1. Joins as a new participant (display-name prompt → first vote)
 *   2. Resumes their existing participation (picks restored)
 *
 * After they crown their own winner, we show their pick alongside the
 * community tally — IF the bracket's reveal_mode permits it.
 *
 * For simplicity v1 supports knockout brackets only.  Round-robin shared
 * brackets show a "use the desktop app to vote on this format" notice.
 * Most multiplayer use cases are knockout anyway.
 */

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Cover from "./Cover.jsx";
import VictoryScreen from "./VictoryScreen.jsx";
import ShareSheet from "./ShareSheet.jsx";
import LoginModal from "../lib/LoginModal.jsx";
import { useAuth } from "../lib/AuthContext.jsx";
import {
  getBracketByShareCode,
  getMyParticipation,
  joinBracket,
  savePicks,
  listParticipations,
  tallyVotes,
  tallyChampions,
} from "../lib/multiplayerSync.js";
import { buildBracket, getBracketWinner } from "./bracket.js";
import { getAnonName, setAnonName } from "./anonId.js";
import { playUI, playStar, playBattleStart } from "./soundscape.js";

const REFRESH_PARTICIPANTS_MS = 8000;

export default function SharedBracketView() {
  const { shareCode } = useParams();
  const navigate      = useNavigate();
  const { user }      = useAuth();

  const [bracket,        setBracket]       = useState(null);
  const [loading,        setLoading]       = useState(true);
  const [notFound,       setNotFound]      = useState(false);
  const [participation,  setParticipation] = useState(null);
  const [participants,   setParticipants]  = useState([]);
  const [activeMatchId,  setActiveMatchId] = useState(null);
  const [showVictory,    setShowVictory]   = useState(false);
  const [showShare,      setShowShare]     = useState(false);
  const [nameDraft,      setNameDraft]     = useState(getAnonName());
  const [showLogin,      setShowLogin]     = useState(false);

  // ── Load bracket ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const b = await getBracketByShareCode(shareCode);
      if (cancelled) return;
      if (!b) { setNotFound(true); setLoading(false); return; }
      setBracket(b);
      // If signed-in, see if a participation already exists
      const mine = await getMyParticipation(b.id, user?.id || null);
      if (!cancelled && mine) setParticipation(mine);
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [shareCode, user?.id]);

  // ── Refresh participants list periodically once joined ──────────
  useEffect(() => {
    if (!bracket?.id || !participation) return;
    let cancelled = false;
    const fetch = async () => {
      const list = await listParticipations(bracket.id);
      if (!cancelled) setParticipants(list);
    };
    fetch();
    const t = setInterval(fetch, REFRESH_PARTICIPANTS_MS);
    return () => { cancelled = true; clearInterval(t); };
  }, [bracket?.id, participation?.id]);

  // ── Join handler ────────────────────────────────────────────────
  const onJoin = async () => {
    if (!bracket) return;
    const name = (nameDraft || "").trim() || getAnonName();
    setAnonName(name);
    playUI("commit");
    try {
      const row = await joinBracket(bracket.id, name, user?.id || null);
      setParticipation(row);
    } catch (e) {
      console.warn("[SharedBracket] joinBracket failed", e);
      alert("Couldn't join the bracket — the link may have been revoked or voting may have closed.");
    }
  };

  // ── Voting helpers ──────────────────────────────────────────────
  const items  = bracket?.items || [];
  const built  = items.length >= 2 ? buildBracket(items) : { rounds: [], seeds: items };
  const rounds = built.rounds;
  const myPicks = participation?.picks || {};

  const doVote = async (matchId, book, isFinalRound = false) => {
    if (!participation) return;
    playUI("commit");
    const next = { ...myPicks, [matchId]: book };
    let winner = participation.winner || null;
    let complete = !!participation.completed_at;
    if (isFinalRound) {
      // Recompute champion using next picks
      const finalMatch = rounds[rounds.length - 1][0];
      const champ = finalMatch.id === matchId ? book
                  : getBracketWinner(finalMatch.id, rounds, next);
      if (champ) {
        winner = champ;
        complete = true;
        playStar();
        setShowVictory(true);
      }
    }
    const saved = await savePicks(participation, { picks: next, winner, complete });
    if (saved) setParticipation(saved);
    setActiveMatchId(null);
  };

  // ── Render ──────────────────────────────────────────────────────
  if (loading) {
    return <Frame><div style={{ color: "#9ca3af", fontSize: 13 }}>Loading bracket…</div></Frame>;
  }
  if (notFound) {
    return (
      <Frame>
        <div style={{ fontSize: 40 }}>🔒</div>
        <div style={{ fontWeight: 800, fontSize: 16, color: "#1c1917" }}>Link not found</div>
        <div style={{ color: "#78716c", fontSize: 13, textAlign: "center", maxWidth: 320 }}>
          This share link was revoked, or it was never valid.
          Ask whoever sent it to share again.
        </div>
        <button onClick={() => navigate("/books")}
          style={{ marginTop: 8, background: "#14532d", color: "#fff", border: "none", borderRadius: 99, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          Go to The Bracket Club
        </button>
      </Frame>
    );
  }

  if (bracket.format === "round_robin") {
    return (
      <Frame>
        <div style={{ fontSize: 40 }}>🚧</div>
        <div style={{ fontWeight: 800, fontSize: 16 }}>Round-robin sharing coming soon</div>
        <div style={{ color: "#78716c", fontSize: 13, textAlign: "center", maxWidth: 320 }}>
          Multiplayer voting on round-robin brackets isn't ready yet.
          Try a knockout bracket instead.
        </div>
      </Frame>
    );
  }

  const closed = bracket.voting_closes_at && new Date(bracket.voting_closes_at) < new Date();

  if (!participation) {
    if (!bracket.allow_anonymous && !user) {
      return (
        <Frame>
          <div style={{ fontSize: 40 }}>🔐</div>
          <div style={{ fontWeight: 800, fontSize: 18, color: "#14532d", textAlign: "center" }}>
            {bracket.title}
          </div>
          <div style={{ color: "#78716c", fontSize: 13, textAlign: "center", maxWidth: 320 }}>
            The author requires sign-in to vote on this bracket.
          </div>
          <button onClick={() => setShowLogin(true)}
            style={{ background: "#14532d", color: "#fff", border: "none", borderRadius: 99, padding: "12px 22px", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
            Sign in to vote
          </button>
          {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
        </Frame>
      );
    }
    if (closed) {
      return (
        <Frame>
          <div style={{ fontSize: 40 }}>⏰</div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>Voting has closed</div>
          <div style={{ color: "#78716c", fontSize: 13, textAlign: "center", maxWidth: 320 }}>
            New picks are no longer accepted on this bracket.
          </div>
        </Frame>
      );
    }
    return (
      <Frame>
        <div style={{ fontSize: 40 }}>🏆</div>
        <div style={{ fontWeight: 800, fontSize: 22, color: "#14532d", textAlign: "center", lineHeight: 1.25 }}>
          {bracket.title}
        </div>
        <div style={{ color: "#78716c", fontSize: 13, textAlign: "center", maxWidth: 360 }}>
          You've been invited to vote.  Pick your champion!
        </div>
        <div style={{ width: "100%", maxWidth: 360, display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#1c1917" }}>Your name</label>
          <input
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            placeholder="How should we show you?"
            style={{ padding: "10px 12px", borderRadius: 10, border: "1.5px solid #e2e8f0", fontSize: 14, outline: "none" }}
          />
        </div>
        <button onClick={onJoin}
          style={{ background: "#14532d", color: "#fff", border: "none", borderRadius: 99, padding: "12px 28px", fontWeight: 800, fontSize: 14, cursor: "pointer", marginTop: 4 }}>
          Start voting →
        </button>
        {!user && (
          <button onClick={() => setShowLogin(true)}
            style={{ background: "none", border: "none", color: "#78716c", fontSize: 11, cursor: "pointer", marginTop: 2 }}>
            Sign in to save picks across devices
          </button>
        )}
        {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
      </Frame>
    );
  }

  // ── Active 1v1 picker ──────────────────────────────────────────
  if (activeMatchId) {
    const match = rounds.flat().find((m) => m.id === activeMatchId);
    if (!match) { setActiveMatchId(null); return null; }
    const contenders = [];
    if (match.a !== undefined) {
      contenders.push(match.a, match.b);
      if (match.c) contenders.push(match.c);
    } else {
      [match.feedA, match.feedB, match.feedC].forEach((fid) => {
        if (!fid) return;
        const w = getBracketWinner(fid, rounds, myPicks);
        if (w) contenders.push(w);
      });
    }
    const isFinal = rounds[rounds.length - 1].some((m) => m.id === match.id);
    const winner  = myPicks[match.id];

    return (
      <Frame>
        <button onClick={() => setActiveMatchId(null)}
          style={{ alignSelf: "flex-start", background: "none", border: "none", color: "#15803d", fontWeight: 700, fontSize: 13, cursor: "pointer", padding: 0 }}>
          ‹ Back
        </button>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 2 }}>
            {isFinal ? "Final" : "Pick the Winner"}
          </div>
          <div style={{ fontWeight: 800, fontSize: 18, color: "#1c1917", marginTop: 4 }}>
            {bracket.title}
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, width: "100%" }}>
          {contenders.map((book, i) => {
            const won = winner?.id === book?.id;
            const lost = winner && !won;
            return (
              <button key={`${match.id}-${i}`}
                onClick={() => doVote(match.id, book, isFinal)}
                disabled={!!winner}
                style={{
                  flex: 1, border: `2px solid ${won ? "#22c55e" : "#e7e5e4"}`,
                  background: won ? "#f0fdf4" : lost ? "#fafaf9" : "#fff",
                  borderRadius: 18, padding: "16px 10px",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                  cursor: winner ? "default" : "pointer",
                  opacity: lost ? 0.5 : 1,
                  boxShadow: won ? "0 4px 20px #22c55e44" : "0 1px 4px #0001",
                  transition: "all .2s",
                }}>
                <Cover book={book} size="lg" />
                <div style={{ fontSize: 13, fontWeight: 800, color: "#1c1917", textAlign: "center" }}>
                  {book?.title}
                </div>
                {book?.author && <div style={{ fontSize: 11, color: "#78716c" }}>{book.author}</div>}
                {won && <span style={{ fontSize: 22 }}>🏆</span>}
              </button>
            );
          })}
        </div>
      </Frame>
    );
  }

  // ── Overview: list of matches + community results ─────────────
  const totalMatches = rounds.flat().length;
  const myComplete   = !!participation.completed_at;
  const wantsResults = bracket.reveal_mode === "live" || myComplete;
  const tally        = wantsResults ? tallyVotes(participants) : {};
  const champTally   = wantsResults ? tallyChampions(participants) : null;

  return (
    <Frame>
      <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button onClick={() => navigate("/books")}
          style={{ background: "none", border: "none", color: "#15803d", fontWeight: 700, fontSize: 13, cursor: "pointer", padding: 0 }}>
          ‹ Home
        </button>
        <div style={{ fontSize: 11, color: "#9ca3af" }}>
          {participants.length} voting
        </div>
      </div>

      <div style={{ textAlign: "center" }}>
        <div style={{ fontWeight: 800, fontSize: 20, color: "#14532d" }}>{bracket.title}</div>
        <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
          {Object.keys(myPicks).length} / {totalMatches} matches voted
          {bracket.voting_closes_at && (
            <> · closes {new Date(bracket.voting_closes_at).toLocaleDateString()}</>
          )}
        </div>
      </div>

      {myComplete && participation.winner && (
        <button onClick={() => setShowShare(true)}
          style={{ background: "#fbbf24", color: "#14532d", border: "none", borderRadius: 99, padding: "10px 16px", fontWeight: 800, fontSize: 13, cursor: "pointer", alignSelf: "center" }}>
          📤 Share your champion
        </button>
      )}

      {/* Match list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
        {rounds.flat().map((match) => {
          const ready = matchReady(match, rounds, myPicks);
          const myPick = myPicks[match.id];
          const t = tally[match.id];
          return (
            <div key={match.id}
              style={{
                background: "#fff", borderRadius: 12,
                padding: "10px 12px",
                boxShadow: "0 1px 4px #0001",
                opacity: ready ? 1 : 0.5,
              }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1 }}>
                    {match.id.replace("_", " ")}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#1c1917", marginTop: 2 }}>
                    {myPick ? (
                      <span style={{ color: "#15803d" }}>You picked: {myPick.title}</span>
                    ) : ready ? (
                      "Tap to vote"
                    ) : (
                      "Waiting for earlier match"
                    )}
                  </div>
                  {wantsResults && t && (
                    <div style={{ fontSize: 11, color: "#78716c", marginTop: 4 }}>
                      Group: {t.totalVotes} {t.totalVotes === 1 ? "vote" : "votes"}
                      {t.topBookId && (
                        <> · leader {Math.round((t.topVotes / t.totalVotes) * 100)}%</>
                      )}
                    </div>
                  )}
                </div>
                {ready && !myPick && (
                  <button onClick={() => { setActiveMatchId(match.id); playBattleStart(); }}
                    style={{ background: "#14532d", color: "#fff", border: "none", borderRadius: 99, padding: "8px 14px", fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>
                    Vote →
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Community champion (after reveal) */}
      {wantsResults && champTally && champTally.totalVoters > 0 && (
        <div style={{ background: "#f0fdf4", border: "1.5px solid #86efac", borderRadius: 14, padding: 14, width: "100%" }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#15803d", textTransform: "uppercase", letterSpacing: 1, textAlign: "center" }}>
            Group champion
          </div>
          {(() => {
            const topBook = participants
              .flatMap((p) => p.winner ? [p.winner] : [])
              .find((b) => b.id === champTally.topBookId);
            if (!topBook) return null;
            const pct = Math.round((champTally.topVotes / champTally.totalVoters) * 100);
            return (
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
                <Cover book={topBook} size="sm" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: "#14532d" }}>{topBook.title}</div>
                  <div style={{ fontSize: 11, color: "#78716c" }}>
                    {pct}% of {champTally.totalVoters} {champTally.totalVoters === 1 ? "voter" : "voters"} crowned this
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Participants list */}
      {bracket.show_participant_names && participants.length > 0 && (
        <div style={{ width: "100%" }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
            Voters
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {participants.map((p) => (
              <div key={p.id}
                style={{
                  background: p.completed_at ? "#dcfce7" : "#f5f5f4",
                  color: p.completed_at ? "#15803d" : "#78716c",
                  border: `1px solid ${p.completed_at ? "#86efac" : "#e7e5e4"}`,
                  borderRadius: 99, padding: "4px 10px",
                  fontSize: 11, fontWeight: 700,
                }}>
                {p.completed_at ? "🏆 " : ""}{p.display_name}
              </div>
            ))}
          </div>
        </div>
      )}

      {showVictory && participation?.winner && (
        <VictoryScreen
          book={participation.winner}
          title={bracket.title}
          subtitle="Your champion"
          onClose={() => setShowVictory(false)}
          onShare={() => { setShowVictory(false); setShowShare(true); }}
        />
      )}

      {showShare && participation?.winner && (
        <ShareSheet
          book={participation.winner}
          bracketName={bracket.title}
          subtitle="My champion"
          onClose={() => setShowShare(false)}
        />
      )}
    </Frame>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Is a match ready to vote on? (Both feeders resolved.) */
function matchReady(match, rounds, picks) {
  if (match.a !== undefined) return true;
  const aOk = match.feedA ? !!getBracketWinner(match.feedA, rounds, picks) : true;
  const bOk = match.feedB ? !!getBracketWinner(match.feedB, rounds, picks) : true;
  const cOk = match.feedC ? !!getBracketWinner(match.feedC, rounds, picks) : true;
  return aOk && bOk && cOk;
}

function Frame({ children }) {
  return (
    <div style={{
      minHeight: "100vh", background: "#f0fdf4",
      padding: "60px 16px 32px",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 14,
    }}>
      <div style={{ width: "100%", maxWidth: 520, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        {children}
      </div>
    </div>
  );
}
