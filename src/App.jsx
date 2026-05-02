/**
 * App.jsx — Books category page.
 *
 * Rendered at /books by CategoryRouter. Owns all state for one year of data and
 * hands slices down to the three main views via a tab-based layout:
 *
 *   📚 My Shelf  (Month component)   — personal reading log, monthly bracket voting
 *   🔥 Trending  (Popular component) — Goodreads trending, personalized via prefs
 *   🏆 Bracket   (BracketHub)        — year-end tournament across monthly winners
 *
 * State lives in localStorage via createStore() (storage.js). When a backend is
 * added, only the load/save calls in the root useEffect need to change — all
 * child components already receive data as props and call save() callbacks.
 *
 * The three-panel slide animation is driven by a CSS translateX on a wrapper div.
 * All overlay components (sheets, modals) use createPortal(…, document.body) to
 * escape the transform stacking context, which would otherwise break position:fixed.
 */

import { useState, useEffect, useRef, useCallback } from "react";

// ─── Shared modules ──────────────────────────────────────────────────────────
import { MONTHS, FULL, COLORS, R1, R2, MATCHES } from "./shared/constants.js";
import { buildBracket, getBracketWinner, isMatchEmpty, getR1Winner, getMatchItems } from "./shared/bracket.js";
import { createStore, freshData, freshTrendingData, migrateStorage } from "./shared/storage.js";
import { fmtCount } from "./shared/helpers.js";
import Cover from "./shared/Cover.jsx";
import ItemSearch from "./shared/ItemSearch.jsx";
import { getCategoryConfig } from "./shared/categoryConfig.js";
import { getOnboarding, setOnboarding } from "./shared/onboarding.js";
import { getTrendingPrefs, setTrendingPrefs, resetTrendingPrefs } from "./shared/trendingPreferences.js";
import { rankTrending } from "./shared/rankTrending.js";
import Welcome from "./shared/Welcome.jsx";
import Tour from "./shared/Tour.jsx";
import TrendingOnboarding, { TrendingBanner, TrendingControlsSheet } from "./shared/TrendingOnboarding.jsx";
import BookDetailSheet from "./shared/BookDetailSheet.jsx";

const CAT = getCategoryConfig();

// ─── Book-specific modules ──────────────────────────────────────────────────
import { extractGoodreadsUserId, fetchGoodreadsRSS, parseGoodreadsRSS, parseGoodreadsRSSAll, fetchAllGoodreadsBooks, parseGoodreadsCSV, fetchTrendingBooks, fetchGenreTrending, enrichBooks, searchBooks } from "./categories/books/data.js";
import { generateMonthlyCard, generateTop3Card, generateBOTYCard } from "./categories/books/share.js";

// ─── Book storage instances ─────────────────────────────────────────────────
const store = createStore("botb_");
const trendingStore = createStore("botb_pop_");

// ─── Helpers ────────────────────────────────────────────────────────────────
function getBooks(match, months, bracket) {
  return getMatchItems(match, months, bracket, R1);
}


// ─── Share Overlay ───────────────────────────────────────────────────────────
function ShareOverlay({ data, year, onClose }) {
  const [cards, setCards] = useState([null, null, null]);
  const [cardIdx, setCardIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const swipeRef = useRef(null);
  const LABELS = ["Monthly Picks", "Top 3", CAT.champion];

  useEffect(() => {
    let urls = [];
    let cancelled = false;
    (async () => {
      const blobs = await Promise.all([
        generateMonthlyCard(data, year),
        generateTop3Card(data, year),
        generateBOTYCard(data, year),
      ]);
      if (cancelled) return;
      urls = blobs.map(b => URL.createObjectURL(b));
      setCards(urls);
      setLoading(false);
    })();
    return () => { cancelled = true; urls.forEach(u => URL.revokeObjectURL(u)); };
  }, []);

  const onTouchStart = (e) => {
    swipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e) => {
    if (!swipeRef.current) return;
    const dx = e.changedTouches[0].clientX - swipeRef.current.x;
    const dy = e.changedTouches[0].clientY - swipeRef.current.y;
    swipeRef.current = null;
    if (Math.abs(dy) > Math.abs(dx) || Math.abs(dx) < 50) return;
    if (dx < 0 && cardIdx < 2) setCardIdx(i => i + 1);
    else if (dx > 0 && cardIdx > 0) setCardIdx(i => i - 1);
  };

  const doDownload = () => {
    if (!cards[cardIdx]) return;
    const names = ["monthly-picks", "top-3", "book-of-the-year"];
    const a = document.createElement("a");
    a.href = cards[cardIdx];
    a.download = `bracket-club-${year}-${names[cardIdx]}.png`;
    a.click();
  };

  const doShare = async () => {
    if (!cards[cardIdx]) return;
    const names = ["monthly-picks", "top-3", "book-of-the-year"];
    try {
      const res = await fetch(cards[cardIdx]);
      const blob = await res.blob();
      const file = new File([blob], `bracket-club-${year}-${names[cardIdx]}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "The Bracket Club" });
        return;
      }
    } catch (e) {
      if (e.name === "AbortError") return;
    }
    doDownload();
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "rgba(0,0,0,0.88)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      fontFamily: "system-ui, -apple-system, sans-serif",
    }}>
      <button onClick={onClose} style={{
        position: "absolute", top: 16, right: 16, zIndex: 110,
        background: "rgba(255,255,255,0.12)", border: "none", borderRadius: 99,
        width: 38, height: 38, fontSize: 18, color: "#fff", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>✕</button>

      <div style={{ color: "#fff", fontWeight: 800, fontSize: 15, marginBottom: 12, letterSpacing: 1, textTransform: "uppercase" }}>
        {LABELS[cardIdx]}
      </div>

      {loading ? (
        <div style={{ color: "#fff", fontSize: 14, opacity: 0.6, padding: "40px 0" }}>Generating cards...</div>
      ) : (
        <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
          style={{ width: "100%", maxWidth: 340, overflow: "hidden" }}>
          <div style={{
            display: "flex", width: "300%",
            transform: `translateX(-${cardIdx * (100 / 3)}%)`,
            transition: "transform 0.3s ease-out",
          }}>
            {cards.map((url, i) => (
              <div key={i} style={{ width: "33.333%", padding: "0 6px", boxSizing: "border-box" }}>
                {url ? (
                  <img src={url} alt={LABELS[i]} style={{ width: "100%", borderRadius: 12, boxShadow: "0 8px 40px rgba(0,0,0,0.5)" }} />
                ) : (
                  <div style={{ width: "100%", aspectRatio: "1080/1350", background: "rgba(255,255,255,0.05)", borderRadius: 12 }} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        {[0, 1, 2].map(i => (
          <button key={i} onClick={() => setCardIdx(i)} style={{
            width: cardIdx === i ? 24 : 8, height: 8, borderRadius: 4,
            background: cardIdx === i ? "#fff" : "rgba(255,255,255,0.25)",
            border: "none", cursor: "pointer", transition: "all 0.2s", padding: 0,
          }} />
        ))}
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
        <button onClick={doDownload} disabled={loading} style={{
          background: loading ? "rgba(255,255,255,0.2)" : "#fff",
          color: "#14532d", border: "none", borderRadius: 99,
          padding: "12px 24px", fontWeight: 800, fontSize: 14,
          cursor: loading ? "default" : "pointer",
        }}>
          Save
        </button>
        <button onClick={doShare} disabled={loading} style={{
          background: loading ? "rgba(34,197,94,0.4)" : "#22c55e",
          color: "#fff", border: "none", borderRadius: 99,
          padding: "12px 24px", fontWeight: 800, fontSize: 14,
          cursor: loading ? "default" : "pointer",
        }}>
          Share
        </button>
      </div>
    </div>
  );
}

// ─── App Shell ────────────────────────────────────────────────────────────────
export default function App() {
  const [data,     setData]     = useState(null);
  const [trendingData,  setTrendingData]  = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [view,     setView]     = useState("home");
  const [battleId, setBattleId] = useState(null);
  const [year,     setYear]     = useState(new Date().getFullYear());
  const [showShare, setShowShare] = useState(false);
  const [ob, setOb] = useState(getOnboarding);
  const [tourActive, setTourActive] = useState(false);

  const markOb = (updates) => setOb(setOnboarding(updates));

  useEffect(() => {
    migrateStorage();
    const existing = store.get(year);
    if (existing) {
      setData(existing);
      setLoading(false);
      return;
    }
    // DEV: auto-load Tara's Goodreads shelf for testing — remove before production
    const DEV_GOODREADS_USER = "152670076";
    (async () => {
      try {
        const allBooks = await fetchAllGoodreadsBooks(DEV_GOODREADS_USER);
        const byYear = {};
        allBooks.forEach(book => {
          if (!byYear[book.year]) byYear[book.year] = [];
          byYear[book.year].push(book);
        });
        for (const [yr, books] of Object.entries(byYear)) {
          if (store.get(Number(yr))) continue;
          const nd = freshData();
          books.forEach((book, i) => {
            nd.months[book.month].books.push({
              id: Date.now() + i + Number(yr) * 1000,
              title: book.title,
              author: book.author,
              cover: book.cover || "",
              rating: book.rating,
            });
          });
          store.set(Number(yr), nd);
        }
        setData(store.get(year) || freshData());
      } catch {
        setData(freshData());
      }
      setTrendingData(trendingStore.get(year) || freshTrendingData());
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!loading) {
      setData(store.get(year) || freshData());
      setTrendingData(trendingStore.get(year) || freshTrendingData());
      setBattleId(null);
    }
  }, [year]);

  const save = (nd) => { setData({ ...nd }); store.set(year, nd); };
  const saveTrending = (nd) => { setTrendingData({ ...nd }); trendingStore.set(year, nd); };

  const NAV = [
    { v:"home",    icon:"🏠", lbl:"Home"    },
    { v:"popular", icon:"🔥", lbl:"Trending" },
    { v:"bracket", icon:"🏆", lbl:"Bracket" },
  ];

  const VIEWS = ["home", "popular", "bracket"];
  const viewIdx = view === "import" ? 0 : VIEWS.indexOf(view);
  const swipeRef = useRef(null);

  const onSwipeStart = (e) => {
    swipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onSwipeEnd = (e) => {
    if (!swipeRef.current) return;
    const dx = e.changedTouches[0].clientX - swipeRef.current.x;
    const dy = e.changedTouches[0].clientY - swipeRef.current.y;
    swipeRef.current = null;
    if (Math.abs(dy) > Math.abs(dx) || Math.abs(dx) < 50) return;
    const vi = VIEWS.indexOf(view);
    if (dx < 0 && vi < 2) { setBattleId(null); setView(VIEWS[vi + 1]); }
    else if (dx > 0 && vi > 0) { setBattleId(null); setView(VIEWS[vi - 1]); }
  };

  const curM = new Date().getMonth();
  const hideNav = view === "import";

  if (loading) {
    return (
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", background:"#f0fdf4", color:"#166534", fontFamily:"system-ui,sans-serif", fontSize:16 }}>
        📚 Loading...
      </div>
    );
  }

  return (
    <div style={{ height:"100dvh", background:"#f0fdf4", fontFamily:"system-ui,-apple-system,sans-serif", maxWidth:430, margin:"0 auto", position:"relative", display:"flex", flexDirection:"column", overflow:"hidden" }}>
      {/* Header */}
      <div style={{ background:"#14532d", color:"#fff", textAlign:"center", padding:"6px 16px 2px", flexShrink:0, zIndex:20, boxShadow:"0 2px 8px #0002" }}>
        <img src="/logo.png" alt="Bracket Club" style={{ height:56, width:56, objectFit:"contain" }} />
      </div>

      {/* Views */}
      {view === "import" ? (
        <div style={{ flex:1, height:0, overflowY:"auto", WebkitOverflowScrolling:"touch", overscrollBehavior:"none" }}>
          <Import data={data} save={save} onDone={() => setView("home")} year={year} />
        </div>
      ) : (
        <div onTouchStart={onSwipeStart} onTouchEnd={onSwipeEnd} style={{ flex:1, height:0, overflow:"hidden" }}>
          <div style={{ display:"flex", width:"300%", height:"100%", transform:`translateX(-${viewIdx*(100/3)}%)`, transition:"transform 0.3s ease-out" }}>
            <div style={{ width:"33.333%", height:"100%", overflowY:"auto", WebkitOverflowScrolling:"touch", overscrollBehavior:"none" }}>
              <Home data={data} save={save} curM={curM} year={year} setYear={setYear} goBracket={() => setView("bracket")} goImport={() => setView("import")} openShare={() => setShowShare(true)} ob={ob} markOb={markOb} />
            </div>
            <div style={{ width:"33.333%", height:"100%", overflowY:"auto", WebkitOverflowScrolling:"touch", overscrollBehavior:"none" }}>
              <Popular trendingData={trendingData || freshTrendingData()} saveTrending={saveTrending} year={year} setYear={setYear} ob={ob} markOb={markOb} />
            </div>
            <div style={{ width:"33.333%", height:"100%", overflowY:"auto", WebkitOverflowScrolling:"touch", overscrollBehavior:"none" }}>
              <BracketHub data={data} trendingData={trendingData || freshTrendingData()} save={save} saveTrending={saveTrending} battleId={battleId} setBattleId={setBattleId} year={year} openShare={() => setShowShare(true)} ob={ob} markOb={markOb} />
            </div>
          </div>
        </div>
      )}

      {/* Bottom Nav */}
      {!hideNav && (
        <div style={{ flexShrink:0, background:"#fff", borderTop:"1px solid #e5e7eb", display:"flex", zIndex:20 }}>
          {NAV.map(({ v, icon, lbl }) => (
            <button
              key={v}
              onClick={() => { setBattleId(null); setView(v); }}
              style={{ flex:1, padding:"10px 0", display:"flex", flexDirection:"column", alignItems:"center", gap:2, fontSize:11, fontWeight:700, border:"none", background:view===v?"#f0fdf4":"#fff", color:view===v?"#166534":"#9ca3af", cursor:"pointer" }}
            >
              <span style={{ fontSize:20 }}>{icon}</span>{lbl}
            </button>
          ))}
        </div>
      )}

      {showShare && data && <ShareOverlay data={data} year={year} onClose={() => setShowShare(false)} />}
      {!ob.hasSeenWelcome && !loading && (
        <Welcome
          config={CAT}
          onStartTour={() => { markOb({ hasSeenWelcome: true }); setView("home"); setTourActive(true); }}
          onSkip={() => markOb({ hasSeenWelcome: true })}
        />
      )}
      {tourActive && (
        <Tour config={CAT} setView={setView} onDone={() => setTourActive(false)} />
      )}
    </div>
  );
}

// ─── Home ─────────────────────────────────────────────────────────────────────
function Home({ data, save, curM, year, setYear, goBracket, goImport, openShare, ob, markOb }) {
  const [selectedMonth, setSelectedMonth] = useState(null);
  const thisYear = new Date().getFullYear();
  const picks      = data.months.map(m => m.winner);
  const count      = picks.filter(Boolean).length;
  const totalItems = data.months.reduce((n, m) => n + m.books.length, 0);
  const readyMatch = MATCHES.find(m => {
    if (data.bracket[m.id]) return false;
    const { b1, b2 } = getBooks(m, data.months, data.bracket);
    return b1 && b2;
  });

  if (selectedMonth !== null) {
    return <Month data={data} save={save} idx={selectedMonth} setIdx={setSelectedMonth} onBack={() => setSelectedMonth(null)} />;
  }

  return (
    <div style={{ padding:"4px 12px", display:"flex", flexDirection:"column", gap:6, height:"100%", boxSizing:"border-box" }}>

      {/* ── Year Reads grid ── */}
      <div style={{ background:"#fff", borderRadius:16, padding:"6px 10px", boxShadow:"0 1px 4px #0001", flex:1, display:"flex", flexDirection:"column" }}>
        <div data-tour="year-nav" style={{ display:"flex", justifyContent:"center", alignItems:"center", gap:8, marginBottom:4 }}>
          <button onClick={() => setYear(y => y - 1)} disabled={year <= 2015} style={{ width:26, height:26, borderRadius:99, border:"1px solid #e7e5e4", background:"#fff", fontSize:13, cursor:year<=2015?"default":"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:year<=2015?"#d6d3d1":"#14532d", padding:0 }}>‹</button>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontWeight:800, fontSize:15, color:"#1c1917" }}>{year} Your Reads</div>
            <div style={{ fontSize:10, color:"#9ca3af", fontWeight:600 }}>{count} of 12 picks</div>
          </div>
          <button onClick={() => setYear(y => y + 1)} disabled={year >= thisYear + 1} style={{ width:26, height:26, borderRadius:99, border:"1px solid #e7e5e4", background:"#fff", fontSize:13, cursor:year>=thisYear+1?"default":"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:year>=thisYear+1?"#d6d3d1":"#14532d", padding:0 }}>›</button>
        </div>
        <div data-tour="home-grid" style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:6, flex:1 }}>
          {MONTHS.map((m, i) => {
            const pick = picks[i];
            const hasBooksButNoPick = !pick && (data.months[i].books?.length > 0);
            return (
              <button key={m} onClick={() => setSelectedMonth(i)} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:3, border:"none", background:"none", cursor:"pointer", padding:0 }}>
                <span style={{ fontSize:10, fontWeight:700, color:"#9ca3af" }}>{m}</span>
                {pick ? (
                  <div style={{ position:"relative", flex:1, display:"flex" }}>
                    <Cover book={pick} size="md" />
                    <span style={{ position:"absolute", top:-4, right:-4, fontSize:12, background:"#fff", borderRadius:99, width:18, height:18, display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 1px 3px #0002" }}>🏆</span>
                  </div>
                ) : (
                  <div style={{ flex:1, width:56, borderRadius:6, background: hasBooksButNoPick?"#fef9c3":"#f5f5f4", border:`2px dashed ${hasBooksButNoPick?"#fde047":"#e5e7eb"}`, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:2 }}>
                    {hasBooksButNoPick ? <span style={{ fontSize:12 }}>📚</span> : <span style={{ fontSize:9, color:"#d6d3d1", fontWeight:700 }}>TBD</span>}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── First-time hint ── */}
      {totalItems === 0 && (
        <div style={{ background:"#fff", borderRadius:14, padding:"14px 16px", boxShadow:"0 1px 4px #0001", textAlign:"center", flexShrink:0 }}>
          <div style={{ fontWeight:800, fontSize:14, color:"#1c1917", marginBottom:4 }}>
            Start with {FULL[curM]}, or any month you've finished a {CAT.singular}.
          </div>
          <div style={{ fontSize:12, color:"#9ca3af", lineHeight:1.5 }}>
            Tap a month to add {CAT.plural} you {CAT.pastVerb}, then star your favorite to build the bracket.
          </div>
        </div>
      )}

      {/* ── Bracket CTA ── */}
      {count >= 2 && (
        <button onClick={goBracket} style={{ background:"#fff", border:"none", borderRadius:14, padding:"10px 14px", display:"flex", alignItems:"center", gap:10, boxShadow:"0 1px 4px #0001", cursor:"pointer", width:"100%", textAlign:"left", flexShrink:0 }}>
          <span style={{ fontSize:22 }}>🏆</span>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:800, color:"#1c1917", fontSize:13 }}>Tournament Bracket</div>
            <div style={{ fontSize:11, color:readyMatch?"#15803d":"#9ca3af", marginTop:1 }}>
              {readyMatch ? `⚔️ Battle ready!` : `${count} picks in — keep reading!`}
            </div>
          </div>
          <span style={{ color:"#d6d3d1", fontSize:18 }}>›</span>
        </button>
      )}

      {/* ── Bottom row: Import + Share ── */}
      <div style={{ display:"flex", gap:8, flexShrink:0 }}>
        <button data-tour="import-btn" onClick={goImport} style={{ flex:1, background:"#fff", border:"1px solid #e7e5e4", borderRadius:12, padding:"9px 8px", display:"flex", alignItems:"center", justifyContent:"center", gap:5, cursor:"pointer" }}>
          <span style={{ fontSize:15 }}>📥</span>
          <span style={{ fontWeight:700, color:"#14532d", fontSize:12 }}>Import</span>
        </button>
        {count >= 1 && (
          <button onClick={openShare} style={{ flex:1, background:"#fff", border:"1px solid #e7e5e4", borderRadius:12, padding:"9px 8px", display:"flex", alignItems:"center", justifyContent:"center", gap:5, cursor:"pointer" }}>
            <span style={{ fontSize:15 }}>📤</span>
            <span style={{ fontWeight:700, color:"#14532d", fontSize:12 }}>Share</span>
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Goodreads Import View ────────────────────────────────────────────────────
function Import({ data, save, onDone, year }) {
  const [books,    setBooks]    = useState(null);
  const [selected, setSelected] = useState({});
  const [status,   setStatus]   = useState("");
  const [url,      setUrl]      = useState("");
  const [urlError, setUrlError] = useState("");

  const handleUrl = async () => {
    setUrlError("");
    const userId = extractGoodreadsUserId(url);
    if (!userId) { setUrlError("Could not find a Goodreads user ID in that URL."); return; }
    setStatus("fetching");
    try {
      const xml = await fetchGoodreadsRSS(userId);
      const parsed = parseGoodreadsRSS(xml, year);
      if (!parsed.length) { setStatus(""); setUrlError(`No ${year} read books found for this user.`); return; }
      const sel = {};
      parsed.forEach((_, i) => { sel[i] = true; });
      setSelected(sel);
      setBooks(parsed);
      setStatus("covers");
      await fetchCovers(parsed);
      setStatus("");
    } catch (e) {
      setStatus("");
      setUrlError("Failed to fetch from Goodreads. Check the URL and try again.");
    }
  };

  const fetchCovers = async (parsed) => {
    for (let i = 0; i < parsed.length; i++) {
      if (parsed[i].cover) continue;
      try {
        const q   = encodeURIComponent(`${parsed[i].title} ${parsed[i].author}`);
        const res = await fetch(`https://openlibrary.org/search.json?q=${q}&fields=cover_i&limit=1`);
        const json = await res.json();
        const cid  = json.docs?.[0]?.cover_i;
        if (cid) {
          setBooks(prev => prev.map((b, j) => j === i ? { ...b, cover:`https://covers.openlibrary.org/b/id/${cid}-L.jpg` } : b));
        }
      } catch {}
      await new Promise(r => setTimeout(r, 80));
    }
  };

  const toggleAll = (val) => {
    const sel = {};
    (books || []).forEach((_, i) => { sel[i] = val; });
    setSelected(sel);
  };

  const confirmImport = () => {
    const nd = { ...data, months: data.months.map(m => ({ ...m, books: [...m.books] })) };
    books.forEach((book, i) => {
      if (!selected[i]) return;
      const already = nd.months[book.month].books.some(b => b.title.toLowerCase() === book.title.toLowerCase());
      if (already) return;
      nd.months[book.month].books.push({
        id:     Date.now() + i,
        title:  book.title,
        author: book.author,
        cover:  book.cover || "",
        rating: book.rating,
      });
    });
    save(nd);
    onDone();
  };

  const selectedCount = Object.values(selected).filter(Boolean).length;

  // Group by month for display
  const byMonth = {};
  (books || []).forEach((b, i) => {
    if (!byMonth[b.month]) byMonth[b.month] = [];
    byMonth[b.month].push({ ...b, idx: i });
  });

  return (
    <div style={{ padding:16, display:"flex", flexDirection:"column", gap:14, minHeight:"100vh" }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        <button onClick={onDone} style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:"#14532d", padding:0 }}>‹</button>
        <div style={{ flex:1, fontWeight:800, fontSize:18, color:"#1c1917" }}>Goodreads Import</div>
      </div>

      {!books ? (
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <div style={{ fontSize:16, color:"#78716c", textAlign:"center", fontWeight:700 }}>
            Importing books read in <strong style={{ color:"#14532d", fontSize:20 }}>{year}</strong>
          </div>

          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <div style={{ background:"#fff", borderRadius:20, padding:20, boxShadow:"0 1px 4px #0001" }}>
              <div style={{ fontSize:14, fontWeight:800, color:"#1c1917", marginBottom:8 }}>Paste your Goodreads shelf URL</div>
              <div style={{ fontSize:13, color:"#78716c", lineHeight:1.6, marginBottom:12 }}>
                Go to your Goodreads profile → My Books → "Read" shelf, then copy the URL from your browser.
              </div>
              <input
                value={url}
                onChange={e => { setUrl(e.target.value); setUrlError(""); }}
                placeholder="https://www.goodreads.com/review/list/..."
                style={{ width:"100%", border:"1px solid #e7e5e4", borderRadius:10, padding:"11px 14px", fontSize:13, boxSizing:"border-box", outline:"none" }}
              />
              {urlError && <div style={{ fontSize:12, color:"#dc2626", marginTop:6 }}>{urlError}</div>}
            </div>
            <button
              onClick={handleUrl}
              disabled={!url.trim() || status === "fetching"}
              style={{ background: url.trim() ? "#14532d" : "#d6d3d1", color:"#fff", border:"none", borderRadius:16, padding:"16px", fontSize:15, fontWeight:800, cursor: url.trim() ? "pointer" : "default" }}
            >
              {status === "fetching" ? "Fetching from Goodreads…" : "Import from URL"}
            </button>
          </div>
        </div>
      ) : (
        /* ── Preview ── */
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {status === "covers" && (
            <div style={{ fontSize:12, color:"#9ca3af", textAlign:"center" }}>⏳ Fetching book covers…</div>
          )}

          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div style={{ fontSize:13, color:"#78716c" }}>{books.length} books found · {selectedCount} selected</div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => toggleAll(true)}  style={{ fontSize:12, color:"#15803d", background:"none", border:"none", cursor:"pointer", fontWeight:700 }}>All</button>
              <button onClick={() => toggleAll(false)} style={{ fontSize:12, color:"#9ca3af", background:"none", border:"none", cursor:"pointer", fontWeight:700 }}>None</button>
            </div>
          </div>

          {Object.keys(byMonth).sort((a,b) => a-b).map(mi => (
            <div key={mi} style={{ background:"#fff", borderRadius:16, overflow:"hidden", boxShadow:"0 1px 4px #0001" }}>
              <div style={{ padding:"10px 14px 6px", fontSize:11, fontWeight:800, color:"#15803d", textTransform:"uppercase", letterSpacing:1 }}>
                {FULL[mi]}
              </div>
              {byMonth[mi].map(book => (
                <div key={book.idx} onClick={() => setSelected(s => ({ ...s, [book.idx]: !s[book.idx] }))}
                  style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 14px", borderTop:"1px solid #f5f5f4", cursor:"pointer", background: selected[book.idx] ? "#f0fdf4" : "#fff", transition:"background .1s" }}
                >
                  <Cover book={book} size="xs" />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:700, fontSize:13, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", color:"#1c1917" }}>{book.title}</div>
                    <div style={{ fontSize:11, color:"#78716c" }}>{book.author}{book.rating ? ` · ${"★".repeat(book.rating)}` : ""}</div>
                  </div>
                  <div style={{ width:22, height:22, borderRadius:99, border:`2px solid ${selected[book.idx]?"#22c55e":"#d6d3d1"}`, background:selected[book.idx]?"#22c55e":"#fff", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    {selected[book.idx] && <span style={{ color:"#fff", fontSize:12, lineHeight:1 }}>✓</span>}
                  </div>
                </div>
              ))}
            </div>
          ))}

          <button
            onClick={confirmImport}
            disabled={selectedCount === 0}
            style={{ background: selectedCount > 0 ? "#14532d" : "#d6d3d1", color:"#fff", border:"none", borderRadius:16, padding:"16px", fontSize:15, fontWeight:800, cursor: selectedCount > 0 ? "pointer" : "default", position:"sticky", bottom:16 }}
          >
            Import {selectedCount} book{selectedCount !== 1 ? "s" : ""} →
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Month ────────────────────────────────────────────────────────────────────
function Month({ data, save, idx, setIdx, onBack }) {
  const [showManual,   setShowManual]   = useState(false);
  const [form,         setForm]         = useState({ title:"", author:"", cover:"" });
  const [monthBattle,  setMonthBattle]  = useState(null);
  const [showBracket,  setShowBracket]  = useState(false);
  const [detailBook,   setDetailBook]   = useState(null);
  const swipeX = useRef(null);
  const swipeY = useRef(null);
  const m = data.months[idx];
  const monthPicks = m.bracketPicks || {};


  // Swipe left/right to change month
  const onTouchStart = (e) => {
    swipeX.current = e.touches[0].clientX;
    swipeY.current = e.touches[0].clientY;
  };
  const onTouchEnd = (e) => {
    if (swipeX.current === null) return;
    const dx = swipeX.current - e.changedTouches[0].clientX;
    const dy = swipeY.current - e.changedTouches[0].clientY;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      setShowManual(false); setShowBracket(false); setMonthBattle(null);
      if (dx > 0) setIdx(Math.min(11, idx + 1));
      else        setIdx(Math.max(0, idx - 1));
    }
    swipeX.current = null;
  };

  const addBook = (book) => {
    if (!book.title?.trim()) return;
    const newBook = { id:Date.now(), title:book.title.trim(), author:(book.author||"").trim(), cover:(book.cover||"").trim(), rating:null };
    const nd = { ...data };
    nd.months = [...nd.months];
    nd.months[idx] = { ...m, books:[...m.books, newBook] };
    save(nd);
    setForm({ title:"", author:"", cover:"" });
    setShowManual(false);
  };


  const delBook = (id) => {
    const nd = { ...data };
    nd.months = [...nd.months];
    nd.months[idx] = {
      ...m,
      books:  m.books.filter(b => b.id !== id),
      winner: m.winner?.id === id ? null : m.winner,
    };
    save(nd);
  };

  const starBook = (book) => {
    const nd = { ...data };
    nd.months = [...nd.months];
    const alreadyStarred = m.winner?.id === book.id;
    nd.months[idx] = { ...m, winner: alreadyStarred ? null : book };
    save(nd);
  };

  const monthVote = (matchId, book) => {
    const nd = { ...data };
    nd.months = [...nd.months];
    const newPicks = { ...monthPicks, [matchId]: book };
    nd.months[idx] = { ...m, bracketPicks: newPicks };

    const bracket = buildBracket(m.books);
    const finalMatch = bracket.rounds[bracket.rounds.length - 1]?.[0];
    if (finalMatch) {
      const champion = getBracketWinner(finalMatch.id, bracket.rounds, newPicks);
      if (champion && newPicks[finalMatch.id]) {
        nd.months[idx].winner = champion;
      }
    }
    save(nd);
    setMonthBattle(null);
  };

  const monthClearVote = (matchId) => {
    const nd = { ...data };
    nd.months = [...nd.months];
    const newPicks = { ...monthPicks };
    delete newPicks[matchId];
    nd.months[idx] = { ...m, bracketPicks: newPicks, winner: null };
    save(nd);
  };

  const resetMonthBracket = () => {
    if (!confirm("Reset this month's bracket picks?")) return;
    const nd = { ...data };
    nd.months = [...nd.months];
    nd.months[idx] = { ...m, bracketPicks: {}, winner: null };
    save(nd);
  };

  const rateBook = (id, rating) => {
    const nd = { ...data };
    nd.months = [...nd.months];
    const patch = (b) => b.id === id ? { ...b, rating: b.rating === rating ? null : rating } : b;
    const updatedBooks  = m.books.map(patch);
    const updatedWinner = m.winner ? patch(m.winner) : null;
    nd.months[idx] = { ...m, books: updatedBooks, winner: updatedWinner };
    save(nd);
  };

  // ── Monthly bracket battle screen ──
  if (monthBattle && m.books.length >= 2) {
    const bracket = buildBracket(m.books);
    const match = bracket.rounds.flat().find(mt => mt.id === monthBattle);
    if (match) {
      const contenders = [];
      if (match.a !== undefined) {
        contenders.push(match.a, match.b);
        if (match.c) contenders.push(match.c);
      } else {
        if (match.feedA) { const w = getBracketWinner(match.feedA, bracket.rounds, monthPicks); if (w) contenders.push(w); }
        if (match.feedB) { const w = getBracketWinner(match.feedB, bracket.rounds, monthPicks); if (w) contenders.push(w); }
        if (match.feedC) { const w = getBracketWinner(match.feedC, bracket.rounds, monthPicks); if (w) contenders.push(w); }
      }
      const winner = monthPicks[monthBattle];
      const roundNum = bracket.rounds.findIndex(r => r.some(mt => mt.id === monthBattle)) + 1;
      const isFinal = roundNum === bracket.rounds.length;
      const isTriple = contenders.length === 3;

      return (
        <>
          {detailBook && <BookDetailSheet book={detailBook} onClose={() => setDetailBook(null)} />}
          <div style={{ padding:16, display:"flex", flexDirection:"column", gap:16 }}>
          <button onClick={() => setMonthBattle(null)}
            style={{ background:"none", border:"none", color:"#15803d", fontWeight:700, fontSize:13, cursor:"pointer", display:"flex", alignItems:"center", gap:4, padding:0 }}>
            ‹ Back to bracket
          </button>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:11, color:"#9ca3af", textTransform:"uppercase", letterSpacing:2 }}>{isFinal ? "Final" : `Round ${roundNum}`}</div>
            <div style={{ fontWeight:800, fontSize:20, color:"#1c1917", marginTop:4 }}>Pick the Winner</div>
          </div>
          <div style={{ display:"flex", gap: isTriple ? 8 : 12, position:"relative" }}>
            {contenders.filter(Boolean).map((book) => {
              const won = winner?.id === book?.id;
              const lost = winner && !won;
              return (
                <button key={book?.id} onClick={() => monthVote(monthBattle, book)}
                  style={{ flex:1, position:"relative", border:`2px solid ${won?"#22c55e":"#e7e5e4"}`, borderRadius:18, padding: isTriple ? "12px 6px" : "16px 10px", display:"flex", flexDirection:"column", alignItems:"center", gap: isTriple ? 6 : 10, background:won?"#f0fdf4":lost?"#fafaf9":"#fff", transform:won?"scale(1.04)":lost?"scale(.96)":"scale(1)", opacity:lost?0.45:1, boxShadow:won?"0 4px 20px #22c55e44":"0 1px 4px #0001", transition:"all .2s", cursor:"pointer" }}>
                  <Cover book={book} size={isTriple ? "md" : "lg"} />
                  <div style={{ textAlign:"center" }}>
                    <div style={{ fontWeight:800, fontSize: isTriple ? 11 : 13, color:"#1c1917", lineHeight:1.2 }}>{book?.title}</div>
                    {book?.author && <div style={{ fontSize: isTriple ? 9 : 11, color:"#78716c", marginTop:2 }}>{book.author}</div>}
                    {book?.rating && <div style={{ fontSize: isTriple ? 10 : 12, color:"#f59e0b", marginTop:3, letterSpacing:1 }}>{"★".repeat(book.rating)}{"☆".repeat(5 - book.rating)}</div>}
                  </div>
                  {won && <span style={{ fontSize: isTriple ? 18 : 22 }}>🏆</span>}
                  <div onClick={e => { e.stopPropagation(); setDetailBook(book); }}
                    style={{ position:"absolute", top:6, right:6, width:22, height:22, borderRadius:11, background:"rgba(0,0,0,0.08)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, color:"#9ca3af", cursor:"pointer" }}>ⓘ</div>
                </button>
              );
            })}
            {!isTriple && <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", background:"#14532d", color:"#fff", borderRadius:99, width:30, height:30, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:800, boxShadow:"0 2px 8px #14532d66", zIndex:5, pointerEvents:"none" }}>VS</div>}
          </div>
          {winner && (
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:13, color:"#15803d", fontWeight:800 }}>
                {isFinal ? `"${winner.title}" is your pick!` : `"${winner.title}" advances!`}
              </div>
              <button onClick={() => monthClearVote(monthBattle)}
                style={{ fontSize:11, color:"#a8a29e", background:"none", border:"none", marginTop:4, cursor:"pointer", textDecoration:"underline" }}>Change pick</button>
              {isFinal && idx < 11 && (
                <div style={{ marginTop:10 }}>
                  <button onClick={() => { setShowBracket(false); setMonthBattle(null); setIdx(idx + 1); }}
                    style={{ background:"#14532d", color:"#fff", border:"none", borderRadius:99, padding:"10px 24px", fontWeight:800, fontSize:13, cursor:"pointer" }}>
                    Continue to {FULL[idx + 1]} →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        </>
      );
    }
  }

  // ── Monthly pick: special 3-book view ──
  if (showBracket && m.books.length >= 2 && m.books.length <= 3) {
    return (
      <>
        {detailBook && <BookDetailSheet book={detailBook} onClose={() => setDetailBook(null)} />}
        <div style={{ padding:16, display:"flex", flexDirection:"column", gap:16 }}>
        <button onClick={() => setShowBracket(false)}
          style={{ background:"none", border:"none", color:"#15803d", fontWeight:700, fontSize:13, cursor:"pointer", display:"flex", alignItems:"center", gap:4, padding:0 }}>
          ‹ Back to {FULL[idx]}
        </button>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontWeight:800, fontSize:18, color:"#1c1917" }}>Pick your favourite</div>
          <div style={{ fontSize:12, color:"#9ca3af", marginTop:2 }}>{FULL[idx]} — {m.books.length} books</div>
        </div>
        <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
          {m.books.map(book => {
            const won = m.winner?.id === book.id;
            const lost = m.winner && !won;
            return (
              <button key={book.id} onClick={() => {
                const nd = { ...data };
                nd.months = [...nd.months];
                nd.months[idx] = { ...m, winner: won ? null : book };
                save(nd);
              }}
                style={{ flex:1, maxWidth:140, position:"relative", border:`2px solid ${won?"#22c55e":"#e7e5e4"}`, borderRadius:18, padding:"16px 10px", display:"flex", flexDirection:"column", alignItems:"center", gap:10, background:won?"#f0fdf4":lost?"#fafaf9":"#fff", transform:won?"scale(1.04)":lost?"scale(.96)":"scale(1)", opacity:lost?0.4:1, boxShadow:won?"0 4px 20px #22c55e44":"0 1px 4px #0001", transition:"all .2s", cursor:"pointer" }}>
                <Cover book={book} size="lg" />
                <div style={{ textAlign:"center" }}>
                  <div style={{ fontWeight:800, fontSize:12, color:"#1c1917", lineHeight:1.3 }}>{book.title}</div>
                  {book.author && <div style={{ fontSize:10, color:"#78716c", marginTop:2 }}>{book.author}</div>}
                  {book.rating && <div style={{ fontSize:12, color:"#f59e0b", marginTop:3, letterSpacing:1 }}>{"★".repeat(book.rating)}{"☆".repeat(5 - book.rating)}</div>}
                </div>
                {won && <span style={{ fontSize:22 }}>⭐</span>}
                <div onClick={e => { e.stopPropagation(); setDetailBook(book); }}
                  style={{ position:"absolute", top:6, right:6, width:22, height:22, borderRadius:11, background:"rgba(0,0,0,0.08)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, color:"#9ca3af", cursor:"pointer" }}>ⓘ</div>
              </button>
            );
          })}
        </div>
        {m.winner && (
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:13, color:"#15803d", fontWeight:800 }}>
              "{m.winner.title}" is your pick!
            </div>
            {idx < 11 && (
              <button onClick={() => { setShowBracket(false); setIdx(idx + 1); }}
                style={{ marginTop:8, background:"#14532d", color:"#fff", border:"none", borderRadius:99, padding:"10px 24px", fontWeight:800, fontSize:13, cursor:"pointer" }}>
                Continue to {FULL[idx + 1]} →
              </button>
            )}
          </div>
        )}
      </div>
      </>
    );
  }

  // ── Monthly bracket overview (4+ books) ──
  if (showBracket && m.books.length >= 4) {
    const bracket = buildBracket(m.books);
    const { rounds } = bracket;

    return (
      <div style={{ padding:16, display:"flex", flexDirection:"column", gap:16 }}>
        <button onClick={() => setShowBracket(false)}
          style={{ background:"none", border:"none", color:"#15803d", fontWeight:700, fontSize:13, cursor:"pointer", display:"flex", alignItems:"center", gap:4, padding:0 }}>
          ‹ Back to {FULL[idx]}
        </button>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontWeight:800, fontSize:18, color:"#1c1917" }}>{FULL[idx]} Bracket</div>
          <div style={{ fontSize:12, color:"#9ca3af", marginTop:2 }}>{m.books.length} books — pick your favourite</div>
        </div>

        {Object.keys(monthPicks).length > 0 && (
          <div style={{ display:"flex", justifyContent:"flex-end" }}>
            <button onClick={resetMonthBracket}
              style={{ padding:"6px 12px", background:"#fff", border:"1px solid #e7e5e4", borderRadius:8, fontSize:12, fontWeight:700, color:"#dc2626", cursor:"pointer" }}>
              Reset
            </button>
          </div>
        )}

        {rounds.map((round, ri) => {
          const isFinal = ri === rounds.length - 1;
          const roundLabel = isFinal ? "Final" : `Round ${ri + 1}`;
          return (
            <div key={ri} style={{ display:"flex", flexDirection:"column", gap:8 }}>
              <div style={{ fontSize:11, color:"#9ca3af", textTransform:"uppercase", letterSpacing:2, textAlign:"center" }}>{roundLabel}</div>
              <div style={{ display:"grid", gridTemplateColumns:`repeat(${Math.min(round.length, 3)}, 1fr)`, gap:8 }}>
                {round.map(match => {
                  const contenders = [];
                  if (match.a !== undefined) {
                    contenders.push(match.a, match.b);
                    if (match.c) contenders.push(match.c);
                  } else {
                    if (match.feedA) { const w = getBracketWinner(match.feedA, rounds, monthPicks); if (w) contenders.push(w); }
                    if (match.feedB) { const w = getBracketWinner(match.feedB, rounds, monthPicks); if (w) contenders.push(w); }
                    if (match.feedC) { const w = getBracketWinner(match.feedC, rounds, monthPicks); if (w) contenders.push(w); }
                  }
                  const winner = monthPicks[match.id];
                  const needed = match.a !== undefined ? (match.c ? 3 : 2) : (match.feedC ? 3 : 2);
                  const ready = contenders.length === needed && !winner;
                  const locked = !winner && !ready;
                  const canClick = ready || !!winner;
                  const isTriple = needed === 3;

                  return (
                    <button key={match.id}
                      onClick={() => canClick ? setMonthBattle(match.id) : null}
                      style={{
                        display:"flex", flexDirection:"column", alignItems:"center", gap:4,
                        padding:"10px 4px",
                        background: winner ? "#f0fdf4" : "#fff",
                        border: locked ? "2px dashed #e7e5e4" : `2px solid ${winner ? "#22c55e" : "#e7e5e4"}`,
                        borderRadius:14, cursor: canClick ? "pointer" : "default",
                        opacity: locked ? 0.4 : 1, transition:"all .2s",
                      }}>
                      {winner ? (
                        <>
                          <Cover book={winner} size="sm" />
                          <div style={{ fontSize:9, fontWeight:700, color:"#15803d", lineHeight:1.2, textAlign:"center", maxWidth:80 }}>{winner.title}</div>
                          <div style={{ fontSize:7, color:"#22c55e", fontWeight:800, textTransform:"uppercase", letterSpacing:1 }}>Winner</div>
                        </>
                      ) : ready ? (
                        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
                          <div style={{ display:"flex", gap:4, alignItems:"center" }}>
                            {contenders.map((book, ci) => (
                              <div key={book.id} style={{ display:"flex", alignItems:"center", gap:4 }}>
                                {ci > 0 && <span style={{ fontSize:9, fontWeight:800, color:"#78716c" }}>vs</span>}
                                <Cover book={book} size="xs" />
                              </div>
                            ))}
                          </div>
                          <div style={{ fontSize:8, fontWeight:700, color:"#78716c", display:"flex", alignItems:"center", gap:3 }}>
                            <span style={{ fontSize:10 }}>⚔️</span> Battle Ready
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize:11, color:"#d6d3d1", padding:"8px 0" }}>🔒</div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {m.winner && (
          <div style={{ background:"linear-gradient(135deg,#166534,#14532d)", borderRadius:20, padding:18, textAlign:"center", color:"#fff" }}>
            <div style={{ fontSize:10, opacity:.65, textTransform:"uppercase", letterSpacing:2, marginBottom:6 }}>Winner</div>
            <Cover book={m.winner} size="lg" />
            <div style={{ fontWeight:800, fontSize:16, marginTop:8 }}>{m.winner.title}</div>
            {m.winner.author && <div style={{ fontSize:12, opacity:.7, marginTop:2 }}>{m.winner.author}</div>}
            {idx < 11 && (
              <button onClick={() => { setShowBracket(false); setMonthBattle(null); setIdx(idx + 1); }}
                style={{ marginTop:12, background:"#fff", color:"#14532d", border:"none", borderRadius:99, padding:"10px 24px", fontWeight:800, fontSize:13, cursor:"pointer" }}>
                Continue to {FULL[idx + 1]} →
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      style={{ padding:16, display:"flex", flexDirection:"column", gap:12 }}
    >
      {detailBook && <BookDetailSheet book={detailBook} onClose={() => setDetailBook(null)} />}
      {/* Back button */}
      {onBack && (
        <button onClick={onBack}
          style={{ background:"none", border:"none", color:"#15803d", fontWeight:700, fontSize:13, cursor:"pointer", display:"flex", alignItems:"center", gap:4, padding:0 }}>
          ‹ Back to Home
        </button>
      )}

      {/* Month navigation */}
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <button
          onClick={() => { setShowManual(false); setIdx(Math.max(0, idx - 1)); }}
          disabled={idx === 0}
          style={{ width:36, height:36, borderRadius:99, border:"1px solid #e7e5e4", background:"#fff", fontSize:18, cursor:idx===0?"default":"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:idx===0?"#d6d3d1":"#14532d" }}
        >‹</button>
        <div style={{ flex:1, textAlign:"center", fontWeight:800, fontSize:20, color:"#1c1917" }}>{FULL[idx]}</div>
        <button
          onClick={() => { setShowManual(false); setIdx(Math.min(11, idx + 1)); }}
          disabled={idx === 11}
          style={{ width:36, height:36, borderRadius:99, border:"1px solid #e7e5e4", background:"#fff", fontSize:18, cursor:idx===11?"default":"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:idx===11?"#d6d3d1":"#14532d" }}
        >›</button>
      </div>

      {/* Helper text + bracket button */}
      <div style={{ fontSize:12, color:"#9ca3af", textAlign:"center" }}>
        {m.books.length === 0
          ? `Add ${CAT.plural} you ${CAT.pastVerb} this month, then pick your favourite.`
          : m.winner
          ? `⭐ ${m.winner.title} is your pick for the bracket.`
          : m.books.length === 1
          ? `Star this ${CAT.singular} to make it your monthly contender, or add more to battle them.`
          : `Use the bracket below to pick your favourite — that ${CAT.singular} enters the yearly tournament.`}
      </div>

      {m.books.length >= 2 && (
        <button
          onClick={() => { setShowBracket(true); setMonthBattle(null); }}
          style={{
            background: m.winner ? "linear-gradient(135deg,#166534,#14532d)" : "#14532d",
            color:"#fff", border:"none", borderRadius:14, padding:"14px 16px",
            fontWeight:800, fontSize:14, cursor:"pointer",
            display:"flex", alignItems:"center", justifyContent:"center", gap:8,
            boxShadow:"0 2px 8px #14532d44",
          }}>
          {m.winner ? `⭐ ${m.winner.title}` : "⚔️ Pick your favourite"}
          <span style={{ fontSize:11, opacity:.7 }}>→</span>
        </button>
      )}

      {/* Book list */}
      {m.books.map(book => {
        const isStarred = m.winner?.id === book.id;
        const rating    = book.rating || 0;
        return (
          <div
            key={book.id}
            style={{
              display:"flex", alignItems:"center", gap:10,
              background: isStarred ? "#f0fdf4" : "#fff",
              borderRadius:14, padding:"10px 12px",
              border:`2px solid ${isStarred ? "#22c55e" : "#e7e5e4"}`,
              transition:"all .15s",
            }}
          >
            <Cover book={book} size="sm" />
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontWeight:700, color:"#1c1917", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {book.title}
              </div>
              {book.author && (
                <div style={{ fontSize:12, color:"#78716c", marginTop:1 }}>{book.author}</div>
              )}
              {/* Rating */}
              <div style={{ display:"flex", gap:2, marginTop:4 }}>
                {[1,2,3,4,5].map(n => (
                  <button
                    key={n}
                    onClick={() => rateBook(book.id, n)}
                    style={{ background:"none", border:"none", padding:0, cursor:"pointer", fontSize:13, color: n <= rating ? "#f59e0b" : "#d6d3d1", lineHeight:1 }}
                  >
                    {n <= rating ? "★" : "☆"}
                  </button>
                ))}
              </div>
            </div>
            {/* Favourite button (only when < 2 books, otherwise bracket handles it) */}
            {m.books.length < 2 && (
              <button
                onClick={() => starBook(book)}
                style={{
                  background: isStarred ? "#dcfce7" : "#f5f5f4",
                  border:"none", borderRadius:99, width:34, height:34,
                  fontSize:16, cursor:"pointer", flexShrink:0,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  transition:"all .15s",
                }}
                title={isStarred ? "Unstar" : "Pick as favourite"}
              >
                {isStarred ? "⭐" : "☆"}
              </button>
            )}
            {/* Info */}
            <button
              onClick={() => setDetailBook(book)}
              style={{ background:"none", border:"none", fontSize:15, color:"#9ca3af", cursor:"pointer", padding:4, flexShrink:0 }}
              title="Book details"
            >ⓘ</button>
            {/* Delete */}
            <button
              onClick={() => delBook(book.id)}
              style={{ background:"none", border:"none", fontSize:14, color:"#d6d3d1", cursor:"pointer", padding:4, flexShrink:0 }}
            >✕</button>
          </div>
        );
      })}

      {/* Add book — search or manual form */}
      {!showManual ? (
        <ItemSearch onSelect={addBook} onManual={() => setShowManual(true)} placeholder="Search for a book..." searchFn={searchBooks} />
      ) : (
        <div style={{ background:"#fff", border:"2px solid #4ade80", borderRadius:14, padding:14, display:"flex", flexDirection:"column", gap:8 }}>
          {[["title","Book title *"],["author","Author"],["cover","Cover image URL (optional)"]].map(([k, ph]) => (
            <input
              key={k}
              placeholder={ph}
              value={form[k]}
              onChange={e => setForm(f => ({ ...f, [k]:e.target.value }))}
              style={{ width:"100%", border:"1px solid #e7e5e4", borderRadius:8, padding:"9px 12px", fontSize:13, boxSizing:"border-box", outline:"none" }}
            />
          ))}
          <div style={{ display:"flex", gap:8 }}>
            <button
              onClick={() => addBook(form)}
              style={{ flex:1, background:"#14532d", color:"#fff", border:"none", borderRadius:10, padding:"10px 0", fontWeight:800, fontSize:13, cursor:"pointer" }}
            >
              Add Book
            </button>
            <button
              onClick={() => setShowManual(false)}
              style={{ padding:"10px 16px", background:"#f5f5f4", border:"none", borderRadius:10, fontSize:13, cursor:"pointer", color:"#78716c" }}
            >
              ← Search
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

// ─── Popular (Trending Grid) ────────────────────────────────────────────────
function Popular({ trendingData, saveTrending, year, setYear, ob, markOb }) {
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [trendingPrefs, setTrendingPrefs_] = useState(() => getTrendingPrefs(CAT.id));
  const [showControls, setShowControls] = useState(false);
  const [editingPrefs, setEditingPrefs] = useState(false);

  const thisYear = new Date().getFullYear();
  const picks = trendingData.months.map(m => m.winner);
  const count = picks.filter(Boolean).length;

  const showOnboarding = !trendingPrefs.onboardingCompleted || editingPrefs;

  const savePrefs = (updates) => {
    const next = setTrendingPrefs(CAT.id, updates);
    setTrendingPrefs_(next);
    return next;
  };

  const handleComplete = ({ personalizationEnabled, preferences }) => {
    savePrefs({ onboardingCompleted: true, personalizationEnabled, preferences, externalSource: CAT.source });
    markOb({ hasViewedTrending: true });
    setEditingPrefs(false);
  };

  const handleSkip = () => {
    savePrefs({ onboardingCompleted: true, personalizationEnabled: false });
    markOb({ hasViewedTrending: true });
    setEditingPrefs(false);
  };

  const handleReset = () => {
    const next = resetTrendingPrefs(CAT.id);
    setTrendingPrefs_(next);
    setShowControls(false);
  };

  const handleRefresh = () => {
    const cleared = { ...trendingData, months: trendingData.months.map(m => ({ ...m, books: [] })) };
    saveTrending(cleared);
    savePrefs({ resultsLastRefreshedAt: Date.now() });
    setShowControls(false);
  };

  if (selectedMonth !== null) {
    return <TrendingMonth trendingData={trendingData} saveTrending={saveTrending} year={year} idx={selectedMonth} setIdx={setSelectedMonth} onBack={() => setSelectedMonth(null)} trendingPrefs={trendingPrefs} />;
  }

  return (
    <>
      {/* Trending onboarding / preferences modal */}
      {showOnboarding && (
        <TrendingOnboarding
          config={CAT}
          editMode={editingPrefs}
          initialPreferences={editingPrefs ? trendingPrefs.preferences : undefined}
          onComplete={handleComplete}
          onSkip={handleSkip}
        />
      )}

      {/* Controls sheet */}
      {showControls && (
        <TrendingControlsSheet
          prefs={trendingPrefs}
          onEdit={() => { setEditingPrefs(true); setShowControls(false); }}
          onReset={handleReset}
          onRefresh={handleRefresh}
          onClose={() => setShowControls(false)}
        />
      )}

      <div style={{ padding:"4px 12px", display:"flex", flexDirection:"column", gap:6, height:"100%", boxSizing:"border-box" }}>

        {/* Personalization status banner */}
        {trendingPrefs.onboardingCompleted && (
          <TrendingBanner
            prefs={trendingPrefs}
            onPersonalize={() => setEditingPrefs(true)}
            onOpenControls={() => setShowControls(s => !s)}
          />
        )}

        <div style={{ background:"#fff", borderRadius:16, padding:"6px 10px", boxShadow:"0 1px 4px #0001", flex:1, display:"flex", flexDirection:"column" }}>
          <div style={{ display:"flex", justifyContent:"center", alignItems:"center", gap:8, marginBottom:4 }}>
            <button onClick={() => setYear(y => y - 1)} disabled={year <= 2015} style={{ width:26, height:26, borderRadius:99, border:"1px solid #e7e5e4", background:"#fff", fontSize:13, cursor:year<=2015?"default":"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:year<=2015?"#d6d3d1":"#14532d", padding:0 }}>‹</button>
            <div style={{ textAlign:"center" }}>
              <div style={{ fontWeight:800, fontSize:15, color:"#1c1917" }}>{year} Top Trending</div>
              <div style={{ fontSize:10, color:"#9ca3af", fontWeight:600 }}>{count} of 12 picks</div>
            </div>
            <button onClick={() => setYear(y => y + 1)} disabled={year >= thisYear + 1} style={{ width:26, height:26, borderRadius:99, border:"1px solid #e7e5e4", background:"#fff", fontSize:13, cursor:year>=thisYear+1?"default":"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:year>=thisYear+1?"#d6d3d1":"#14532d", padding:0 }}>›</button>
          </div>
          <div data-tour="trending-grid" style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:6, flex:1 }}>
            {MONTHS.map((m, i) => {
              const pick = picks[i];
              const hasBooks = trendingData.months[i].books?.length > 0;
              return (
                <button key={m} onClick={() => setSelectedMonth(i)} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:3, border:"none", background:"none", cursor:"pointer", padding:0 }}>
                  <span style={{ fontSize:10, fontWeight:700, color:"#9ca3af" }}>{m}</span>
                  {pick ? (
                    <div style={{ position:"relative", flex:1, display:"flex" }}>
                      <Cover book={pick} size="md" />
                      <span style={{ position:"absolute", top:-4, right:-4, fontSize:12, background:"#fff", borderRadius:99, width:18, height:18, display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 1px 3px #0002" }}>🏆</span>
                    </div>
                  ) : (
                    <div style={{ flex:1, width:56, borderRadius:6, background: hasBooks?"#fef9c3":"#f5f5f4", border:`2px dashed ${hasBooks?"#fde047":"#e5e7eb"}`, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:2 }}>
                      {hasBooks ? <span style={{ fontSize:12 }}>🔥</span> : <span style={{ fontSize:9, color:"#d6d3d1", fontWeight:700 }}>TBD</span>}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Trending Month Detail ──────────────────────────────────────────────────
function TrendingMonth({ trendingData, saveTrending, year, idx, setIdx, onBack, trendingPrefs }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showBracket, setShowBracket] = useState(false);
  const [monthBattle, setMonthBattle] = useState(null);
  const [detailBook, setDetailBook] = useState(null);
  const swipeX = useRef(null);
  const swipeY = useRef(null);

  const m = trendingData.months[idx];
  const monthPicks = m.bracketPicks || {};
  const rankedBooks = rankTrending(m.books, trendingPrefs);

  useEffect(() => {
    const needsEnrich = m.books.length > 0 && m.books.some(b => b.categories === undefined);
    if (needsEnrich) {
      enrichBooks(m.books).then(books => {
        const nd = { ...trendingData, months: trendingData.months.map((mo, i) => i === idx ? { ...mo, books } : mo) };
        saveTrending(nd);
      });
      return;
    }
    if (m.books.length > 0) return;
    setLoading(true);
    setError("");
    const selectedCats = trendingPrefs?.preferences?.selectedCategories || [];
    Promise.all([
      fetchTrendingBooks(year, idx),
      ...selectedCats.slice(0, 3).map(cat => fetchGenreTrending(year, idx, cat)),
    ])
      .then(([base, ...genreArrays]) => {
        const seen = new Set();
        const merged = [...base, ...genreArrays.flat()].filter(b => {
          if (seen.has(b.id)) return false;
          seen.add(b.id);
          return true;
        });
        return enrichBooks(merged);
      })
      .then(books => {
        const nd = { ...trendingData, months: trendingData.months.map((mo, i) => i === idx ? { ...mo, books } : mo) };
        saveTrending(nd);
        setLoading(false);
      })
      .catch(() => { setError("Couldn't load trending books"); setLoading(false); });
  }, [idx, year]);

  const onTouchStart = (e) => { swipeX.current = e.touches[0].clientX; swipeY.current = e.touches[0].clientY; };
  const onTouchEnd = (e) => {
    if (swipeX.current === null) return;
    const dx = swipeX.current - e.changedTouches[0].clientX;
    const dy = swipeY.current - e.changedTouches[0].clientY;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      setShowBracket(false); setMonthBattle(null);
      if (dx > 0) setIdx(Math.min(11, idx + 1));
      else setIdx(Math.max(0, idx - 1));
    }
    swipeX.current = null;
  };

  const trendingVote = (matchId, book) => {
    const nd = { ...trendingData, months: trendingData.months.map((mo, i) => {
      if (i !== idx) return mo;
      const newPicks = { ...monthPicks, [matchId]: book };
      const bracket = buildBracket(mo.books);
      const finalMatch = bracket.rounds[bracket.rounds.length - 1]?.[0];
      const winner = (finalMatch && newPicks[finalMatch.id]) ? newPicks[finalMatch.id] : mo.winner;
      return { ...mo, bracketPicks: newPicks, winner };
    }) };
    saveTrending(nd);
    setMonthBattle(null);
  };

  const trendingClearVote = (matchId) => {
    const nd = { ...trendingData, months: trendingData.months.map((mo, i) => {
      if (i !== idx) return mo;
      const newPicks = { ...(mo.bracketPicks || {}) };
      delete newPicks[matchId];
      return { ...mo, bracketPicks: newPicks, winner: null };
    }) };
    saveTrending(nd);
  };

  const resetTrendingBracket = () => {
    if (!confirm("Reset this month's picks?")) return;
    const nd = { ...trendingData, months: trendingData.months.map((mo, i) =>
      i === idx ? { ...mo, bracketPicks: {}, winner: null } : mo
    ) };
    saveTrending(nd);
  };

  // ── Battle screen ──
  if (monthBattle && m.books.length >= 2) {
    const bracket = buildBracket(m.books);
    const match = bracket.rounds.flat().find(mt => mt.id === monthBattle);
    if (match) {
      const contenders = [];
      if (match.a !== undefined) {
        contenders.push(match.a, match.b);
        if (match.c) contenders.push(match.c);
      } else {
        if (match.feedA) { const w = getBracketWinner(match.feedA, bracket.rounds, monthPicks); if (w) contenders.push(w); }
        if (match.feedB) { const w = getBracketWinner(match.feedB, bracket.rounds, monthPicks); if (w) contenders.push(w); }
        if (match.feedC) { const w = getBracketWinner(match.feedC, bracket.rounds, monthPicks); if (w) contenders.push(w); }
      }
      const winner = monthPicks[monthBattle];
      const roundNum = bracket.rounds.findIndex(r => r.some(mt => mt.id === monthBattle)) + 1;
      const isFinal = roundNum === bracket.rounds.length;
      const isTriple = contenders.length === 3;

      return (
        <>
          {detailBook && <BookDetailSheet book={detailBook} onClose={() => setDetailBook(null)} />}
          <div style={{ padding:16, display:"flex", flexDirection:"column", gap:16 }}>
          <button onClick={() => setMonthBattle(null)}
            style={{ background:"none", border:"none", color:"#15803d", fontWeight:700, fontSize:13, cursor:"pointer", display:"flex", alignItems:"center", gap:4, padding:0 }}>
            ‹ Back to bracket
          </button>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:11, color:"#9ca3af", textTransform:"uppercase", letterSpacing:2 }}>{isFinal ? "Final" : `Round ${roundNum}`}</div>
            <div style={{ fontWeight:800, fontSize:20, color:"#1c1917", marginTop:4 }}>Pick the Winner</div>
          </div>
          <div style={{ display:"flex", gap: isTriple ? 8 : 12, position:"relative" }}>
            {contenders.filter(Boolean).map((book) => {
              const won = winner?.id === book?.id;
              const lost = winner && !won;
              return (
                <button key={book?.id} onClick={() => trendingVote(monthBattle, book)}
                  style={{ flex:1, position:"relative", border:`2px solid ${won?"#22c55e":"#e7e5e4"}`, borderRadius:18, padding: isTriple ? "12px 6px" : "16px 10px", display:"flex", flexDirection:"column", alignItems:"center", gap: isTriple ? 6 : 10, background:won?"#f0fdf4":lost?"#fafaf9":"#fff", transform:won?"scale(1.04)":lost?"scale(.96)":"scale(1)", opacity:lost?0.45:1, boxShadow:won?"0 4px 20px #22c55e44":"0 1px 4px #0001", transition:"all .2s", cursor:"pointer" }}>
                  <Cover book={book} size={isTriple ? "md" : "lg"} />
                  <div style={{ textAlign:"center" }}>
                    <div style={{ fontWeight:800, fontSize: isTriple ? 11 : 13, color:"#1c1917", lineHeight:1.2 }}>{book?.title}</div>
                    {book?.author && <div style={{ fontSize: isTriple ? 9 : 11, color:"#78716c", marginTop:2 }}>{book.author}</div>}
                    {book?.avgRating && <div style={{ fontSize: isTriple ? 10 : 12, color:"#f59e0b", marginTop:3 }}>★ {book.avgRating.toFixed(1)}</div>}
                  </div>
                  {won && <span style={{ fontSize: isTriple ? 18 : 22 }}>🏆</span>}
                  <div onClick={e => { e.stopPropagation(); setDetailBook(book); }}
                    style={{ position:"absolute", top:6, right:6, width:22, height:22, borderRadius:11, background:"rgba(0,0,0,0.08)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, color:"#9ca3af", cursor:"pointer" }}>ⓘ</div>
                </button>
              );
            })}
            {!isTriple && <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", background:"#14532d", color:"#fff", borderRadius:99, width:30, height:30, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:800, boxShadow:"0 2px 8px #14532d66", zIndex:5, pointerEvents:"none" }}>VS</div>}
          </div>
          {winner && (
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:13, color:"#15803d", fontWeight:800 }}>
                {isFinal ? `"${winner.title}" is your pick!` : `"${winner.title}" advances!`}
              </div>
              <button onClick={() => trendingClearVote(monthBattle)}
                style={{ fontSize:11, color:"#a8a29e", background:"none", border:"none", marginTop:4, cursor:"pointer", textDecoration:"underline" }}>Change pick</button>
              {isFinal && idx < 11 && (
                <div style={{ marginTop:10 }}>
                  <button onClick={() => { setShowBracket(false); setMonthBattle(null); setIdx(idx + 1); }}
                    style={{ background:"#14532d", color:"#fff", border:"none", borderRadius:99, padding:"10px 24px", fontWeight:800, fontSize:13, cursor:"pointer" }}>
                    Continue to {FULL[idx + 1]} →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        </>
      );
    }
  }

  // ── Bracket overview ──
  if (showBracket && m.books.length >= 2) {
    const bracket = buildBracket(m.books);
    const { rounds } = bracket;
    return (
      <div style={{ padding:16, display:"flex", flexDirection:"column", gap:16 }}>
        <button onClick={() => setShowBracket(false)}
          style={{ background:"none", border:"none", color:"#15803d", fontWeight:700, fontSize:13, cursor:"pointer", display:"flex", alignItems:"center", gap:4, padding:0 }}>
          ‹ Back to {FULL[idx]}
        </button>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontWeight:800, fontSize:18, color:"#1c1917" }}>{FULL[idx]} Bracket</div>
          <div style={{ fontSize:12, color:"#9ca3af", marginTop:2 }}>{m.books.length} books — pick your favourite</div>
        </div>
        {Object.keys(monthPicks).length > 0 && (
          <div style={{ display:"flex", justifyContent:"flex-end" }}>
            <button onClick={resetTrendingBracket}
              style={{ padding:"6px 12px", background:"#fff", border:"1px solid #e7e5e4", borderRadius:8, fontSize:12, fontWeight:700, color:"#dc2626", cursor:"pointer" }}>Reset</button>
          </div>
        )}
        {rounds.map((round, ri) => {
          const isFinal = ri === rounds.length - 1;
          return (
            <div key={ri} style={{ display:"flex", flexDirection:"column", gap:8 }}>
              <div style={{ fontSize:11, color:"#9ca3af", textTransform:"uppercase", letterSpacing:2, textAlign:"center" }}>{isFinal ? "Final" : `Round ${ri + 1}`}</div>
              <div style={{ display:"grid", gridTemplateColumns:`repeat(${Math.min(round.length, 3)}, 1fr)`, gap:8 }}>
                {round.map(match => {
                  const contenders = [];
                  if (match.a !== undefined) {
                    contenders.push(match.a, match.b);
                    if (match.c) contenders.push(match.c);
                  } else {
                    if (match.feedA) { const w = getBracketWinner(match.feedA, rounds, monthPicks); if (w) contenders.push(w); }
                    if (match.feedB) { const w = getBracketWinner(match.feedB, rounds, monthPicks); if (w) contenders.push(w); }
                    if (match.feedC) { const w = getBracketWinner(match.feedC, rounds, monthPicks); if (w) contenders.push(w); }
                  }
                  const winner = monthPicks[match.id];
                  const needed = match.a !== undefined ? (match.c ? 3 : 2) : (match.feedC ? 3 : 2);
                  const ready = contenders.length === needed && !winner;
                  const locked = !winner && !ready;
                  const canClick = ready || !!winner;
                  return (
                    <button key={match.id} onClick={() => canClick ? setMonthBattle(match.id) : null}
                      style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4, padding:"10px 4px", background: winner ? "#f0fdf4" : "#fff", border: locked ? "2px dashed #e7e5e4" : `2px solid ${winner ? "#22c55e" : "#e7e5e4"}`, borderRadius:14, cursor: canClick ? "pointer" : "default", opacity: locked ? 0.4 : 1, transition:"all .2s" }}>
                      {winner ? (
                        <>
                          <Cover book={winner} size="sm" />
                          <div style={{ fontSize:9, fontWeight:700, color:"#15803d", lineHeight:1.2, textAlign:"center", maxWidth:80 }}>{winner.title}</div>
                          <div style={{ fontSize:7, color:"#22c55e", fontWeight:800, textTransform:"uppercase", letterSpacing:1 }}>Winner</div>
                        </>
                      ) : ready ? (
                        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
                          <div style={{ display:"flex", gap:4, alignItems:"center" }}>
                            {contenders.map((book, ci) => (
                              <div key={book.id} style={{ display:"flex", alignItems:"center", gap:4 }}>
                                {ci > 0 && <span style={{ fontSize:9, fontWeight:800, color:"#78716c" }}>vs</span>}
                                <Cover book={book} size="xs" />
                              </div>
                            ))}
                          </div>
                          <div style={{ fontSize:8, fontWeight:700, color:"#78716c", display:"flex", alignItems:"center", gap:3 }}>
                            <span style={{ fontSize:10 }}>⚔️</span> Battle Ready
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize:11, color:"#d6d3d1", padding:"8px 0" }}>🔒</div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        {m.winner && (
          <div style={{ background:"linear-gradient(135deg,#166534,#14532d)", borderRadius:20, padding:18, textAlign:"center", color:"#fff" }}>
            <div style={{ fontSize:10, opacity:.65, textTransform:"uppercase", letterSpacing:2, marginBottom:6 }}>Winner</div>
            <Cover book={m.winner} size="lg" />
            <div style={{ fontWeight:800, fontSize:16, marginTop:8 }}>{m.winner.title}</div>
            {m.winner.author && <div style={{ fontSize:12, opacity:.7, marginTop:2 }}>{m.winner.author}</div>}
            {idx < 11 && (
              <button onClick={() => { setShowBracket(false); setMonthBattle(null); setIdx(idx + 1); }}
                style={{ marginTop:12, background:"#fff", color:"#14532d", border:"none", borderRadius:99, padding:"10px 24px", fontWeight:800, fontSize:13, cursor:"pointer" }}>
                Continue to {FULL[idx + 1]} →
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Main view: book list (read-only, no add/delete) ──
  return (
    <>
    {detailBook && <BookDetailSheet book={detailBook} onClose={() => setDetailBook(null)} />}
    <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
      style={{ padding:16, display:"flex", flexDirection:"column", gap:12 }}>

      <button onClick={onBack}
        style={{ background:"none", border:"none", color:"#15803d", fontWeight:700, fontSize:13, cursor:"pointer", display:"flex", alignItems:"center", gap:4, padding:0 }}>
        ‹ Back to Trending
      </button>

      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <button onClick={() => { setShowBracket(false); setMonthBattle(null); setIdx(Math.max(0, idx - 1)); }} disabled={idx === 0}
          style={{ width:36, height:36, borderRadius:99, border:"1px solid #e7e5e4", background:"#fff", fontSize:18, cursor:idx===0?"default":"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:idx===0?"#d6d3d1":"#14532d" }}>‹</button>
        <div style={{ flex:1, textAlign:"center" }}>
          <div style={{ fontWeight:800, fontSize:20, color:"#1c1917" }}>{FULL[idx]}</div>
          <div style={{ fontSize:10, color:"#9ca3af" }}>Trending on Goodreads</div>
        </div>
        <button onClick={() => { setShowBracket(false); setMonthBattle(null); setIdx(Math.min(11, idx + 1)); }} disabled={idx === 11}
          style={{ width:36, height:36, borderRadius:99, border:"1px solid #e7e5e4", background:"#fff", fontSize:18, cursor:idx===11?"default":"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:idx===11?"#d6d3d1":"#14532d" }}>›</button>
      </div>

      {loading && <div style={{ textAlign:"center", color:"#9ca3af", fontSize:13, padding:"40px 0" }}>Loading trending books...</div>}
      {error && <div style={{ textAlign:"center", color:"#dc2626", fontSize:13, padding:"20px 0" }}>{error}</div>}

      {!loading && m.books.length >= 2 && (
        <button onClick={() => { setShowBracket(true); setMonthBattle(null); }}
          style={{ background: m.winner ? "linear-gradient(135deg,#166534,#14532d)" : "#14532d", color:"#fff", border:"none", borderRadius:14, padding:"14px 16px", fontWeight:800, fontSize:14, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8, boxShadow:"0 2px 8px #14532d44" }}>
          {m.winner ? `⭐ ${m.winner.title}` : "⚔️ Pick your favourite"}
          <span style={{ fontSize:11, opacity:.7 }}>→</span>
        </button>
      )}

      {!loading && rankedBooks.map((book, bi) => (
        <div key={book.id} onClick={() => setDetailBook(book)} style={{ display:"flex", alignItems:"center", gap:10, background:"#fff", borderRadius:14, padding:"10px 12px", border:`2px solid ${m.winner?.id === book.id ? "#22c55e" : "#e7e5e4"}`, cursor:"pointer" }}>
          <div style={{ fontSize:14, fontWeight:800, color:"#14532d", width:22, textAlign:"center", flexShrink:0 }}>{bi + 1}</div>
          <Cover book={book} size="sm" />
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontWeight:700, color:"#1c1917", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", fontSize:13 }}>{book.title}</div>
            {book.author && <div style={{ fontSize:11, color:"#78716c", marginTop:1 }}>{book.author}</div>}
            <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:3 }}>
              {book.avgRating && <span style={{ fontSize:11, color:"#f59e0b", fontWeight:700 }}>★ {book.avgRating.toFixed(1)}</span>}
              {book.popularity > 0 && <span style={{ fontSize:10, color:"#9ca3af" }}>{fmtCount(book.popularity)} added</span>}
            </div>
          </div>
          {m.winner?.id === book.id && <span style={{ fontSize:14 }}>🏆</span>}
        </div>
      ))}
    </div>
    </>
  );
}

// ─── Bracket Hub ─────────────────────────────────────────────────────────────
function BracketHub({ data, trendingData, save, saveTrending, battleId, setBattleId, year, openShare, ob, markOb }) {
  const [mode, setMode] = useState(null);

  if (mode === "shelf") {
    return <Bracket data={data} save={save} battleId={battleId} setBattleId={setBattleId} year={year} openShare={openShare} onBack={() => { setMode(null); setBattleId(null); }} label="My Shelf" />;
  }
  if (mode === "popular") {
    return <Bracket data={trendingData} save={saveTrending} battleId={battleId} setBattleId={setBattleId} year={year} openShare={openShare} onBack={() => { setMode(null); setBattleId(null); }} label="Popular Releases" />;
  }

  const shelfPicks = data.months.filter(m => m.winner).length;
  const trendingPicks = trendingData.months.filter(m => m.winner).length;
  const shelfChamp = data.bracket?.["final"];
  const trendingChamp = trendingData.bracket?.["final"];

  const cardStyle = { width:"100%", display:"flex", alignItems:"center", gap:14, background:"#fff", border:"none", borderRadius:16, padding:"18px 16px", boxShadow:"0 1px 4px #0001", cursor:"pointer", textAlign:"left" };

  return (
    <div style={{ padding:16, display:"flex", flexDirection:"column", gap:16 }}>
      <div style={{ fontWeight:800, fontSize:20, color:"#1c1917", textAlign:"center" }}>Brackets</div>

      <div data-tour="bracket-hub" style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <button onClick={() => setMode("shelf")} style={cardStyle}>
        <span style={{ fontSize:28 }}>📚</span>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:800, fontSize:15, color:"#1c1917" }}>My Shelf</div>
          <div style={{ fontSize:12, color: shelfChamp ? "#15803d" : "#78716c", marginTop:2 }}>
            {shelfChamp ? `🏆 ${shelfChamp.title}` : `${shelfPicks}/12 monthly picks`}
          </div>
        </div>
        <span style={{ color:"#d6d3d1", fontSize:18 }}>›</span>
      </button>

      <button onClick={() => setMode("popular")} style={cardStyle}>
        <span style={{ fontSize:28 }}>🔥</span>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:800, fontSize:15, color:"#1c1917" }}>Popular Releases</div>
          <div style={{ fontSize:12, color: trendingChamp ? "#15803d" : "#78716c", marginTop:2 }}>
            {trendingChamp ? `🏆 ${trendingChamp.title}` : `${trendingPicks}/12 monthly picks`}
          </div>
        </div>
        <span style={{ color:"#d6d3d1", fontSize:18 }}>›</span>
      </button>
      </div>
    </div>
  );
}

// ─── Bracket ──────────────────────────────────────────────────────────────────
function Bracket({ data, save, battleId, setBattleId, year, openShare, onBack, label }) {
  const months = data.months;
  const b      = data.bracket || {};
  const [top3Pick, setTop3Pick] = useState(false);

  const vote = (matchId, book) => {
    const nd = { ...data, bracket:{ ...data.bracket, [matchId]:book } };
    save(nd);
    setBattleId(null);
  };

  const clearVote = (matchId) => {
    const nd = { ...data, bracket:{ ...data.bracket } };
    delete nd.bracket[matchId];
    save(nd);
  };

  const getMonthLabel = (book) => {
    if (!book) return "";
    const idx = months.findIndex(m => m.winner?.id === book.id);
    return idx >= 0 ? MONTHS[idx] : "";
  };

  // Resolve R1 winner (with auto-advance)
  const r1Winner = (match) => getR1Winner(match, months, b);

  // Resolve R2 winner (with auto-advance)
  const r2Winner = (match) => {
    if (b[match.id]) return b[match.id];
    const w1 = r1Winner(R1.find(r => r.id === match.p1));
    const w2 = r1Winner(R1.find(r => r.id === match.p2));
    if (w1 && !w2) return w1;
    if (w2 && !w1) return w2;
    return null;
  };

  // ── Battle screen (1v1) ──
  if (battleId) {
    const match = [...R1, ...R2].find(m => m.id === battleId);
    const { b1, b2 } = getBooks(match, months, b);
    const winner = b[match.id];
    const roundLabel = R1.includes(match) ? "Round 1" : "Round 2";

    return (
      <div style={{ padding:16, display:"flex", flexDirection:"column", gap:16 }}>
        <button onClick={() => setBattleId(null)}
          style={{ background:"none", border:"none", color:"#15803d", fontWeight:700, fontSize:13, cursor:"pointer", display:"flex", alignItems:"center", gap:4, padding:0 }}>
          ‹ Back to {label || "bracket"}
        </button>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:11, color:"#9ca3af", textTransform:"uppercase", letterSpacing:2 }}>{roundLabel}</div>
          <div style={{ fontWeight:800, fontSize:20, color:"#1c1917", marginTop:4 }}>Pick the Winner</div>
        </div>
        <div style={{ display:"flex", gap:12, position:"relative" }}>
          {[b1, b2].map((book) => {
            const won  = winner?.id === book?.id;
            const lost = winner && !won;
            const ml   = getMonthLabel(book);
            return (
              <button key={book?.id} onClick={() => vote(battleId, book)}
                style={{ flex:1, border:`2px solid ${won?"#22c55e":"#e7e5e4"}`, borderRadius:18, padding:"16px 10px", display:"flex", flexDirection:"column", alignItems:"center", gap:10, background:won?"#f0fdf4":lost?"#fafaf9":"#fff", transform:won?"scale(1.04)":lost?"scale(.96)":"scale(1)", opacity:lost?0.45:1, boxShadow:won?"0 4px 20px #22c55e44":"0 1px 4px #0001", transition:"all .2s", cursor:"pointer" }}>
                {ml && <div style={{ fontSize:10, fontWeight:700, color:"#78716c", background:"#f5f5f4", borderRadius:99, padding:"2px 8px" }}>{ml}</div>}
                <Cover book={book} size="lg" />
                <div style={{ textAlign:"center" }}>
                  <div style={{ fontWeight:800, fontSize:13, color:"#1c1917" }}>{book?.title}</div>
                  {book?.author && <div style={{ fontSize:11, color:"#78716c", marginTop:2 }}>{book.author}</div>}
                  {book?.rating && <div style={{ fontSize:12, color:"#f59e0b", marginTop:3, letterSpacing:1 }}>{"★".repeat(book.rating)}{"☆".repeat(5 - book.rating)}</div>}
                </div>
                {won && <span style={{ fontSize:22 }}>🏆</span>}
              </button>
            );
          })}
          <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", background:"#14532d", color:"#fff", borderRadius:99, width:30, height:30, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:800, boxShadow:"0 2px 8px #14532d66", zIndex:5, pointerEvents:"none" }}>VS</div>
        </div>
        {winner && (
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:13, color:"#15803d", fontWeight:800 }}>"{winner.title}" advances!</div>
            <button onClick={() => clearVote(battleId)}
              style={{ fontSize:11, color:"#a8a29e", background:"none", border:"none", marginTop:4, cursor:"pointer", textDecoration:"underline" }}>Change pick</button>
          </div>
        )}
      </div>
    );
  }

  // ── Top 3 pick screen (final) ──
  const top3 = R2.map(m => r2Winner(m)).filter(Boolean);
  const finalWinner = b["final"];

  if (top3Pick && top3.length >= 2) {
    return (
      <div style={{ padding:16, display:"flex", flexDirection:"column", gap:16 }}>
        <button onClick={() => setTop3Pick(false)}
          style={{ background:"none", border:"none", color:"#15803d", fontWeight:700, fontSize:13, cursor:"pointer", display:"flex", alignItems:"center", gap:4, padding:0 }}>
          ‹ Back to bracket
        </button>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:11, color:"#9ca3af", textTransform:"uppercase", letterSpacing:2 }}>The Final</div>
          <div style={{ fontWeight:800, fontSize:20, color:"#1c1917", marginTop:4 }}>Pick your {CAT.champion}</div>
        </div>
        <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
          {top3.map(book => {
            const won  = finalWinner?.id === book.id;
            const lost = finalWinner && !won;
            const ml   = getMonthLabel(book);
            return (
              <button key={book.id} onClick={() => vote("final", book)}
                style={{ flex:1, maxWidth:160, border:`2px solid ${won?"#22c55e":"#e7e5e4"}`, borderRadius:18, padding:"16px 10px", display:"flex", flexDirection:"column", alignItems:"center", gap:10, background:won?"#f0fdf4":lost?"#fafaf9":"#fff", transform:won?"scale(1.04)":lost?"scale(.96)":"scale(1)", opacity:lost?0.4:1, boxShadow:won?"0 4px 20px #22c55e44":"0 1px 4px #0001", transition:"all .2s", cursor:"pointer" }}>
                {ml && <div style={{ fontSize:10, fontWeight:700, color:"#78716c", background:"#f5f5f4", borderRadius:99, padding:"2px 8px" }}>{ml}</div>}
                <Cover book={book} size="lg" />
                <div style={{ textAlign:"center" }}>
                  <div style={{ fontWeight:800, fontSize:12, color:"#1c1917", lineHeight:1.3 }}>{book.title}</div>
                  {book.author && <div style={{ fontSize:10, color:"#78716c", marginTop:2 }}>{book.author}</div>}
                  {book.rating && <div style={{ fontSize:12, color:"#f59e0b", marginTop:3, letterSpacing:1 }}>{"★".repeat(book.rating)}{"☆".repeat(5 - book.rating)}</div>}
                </div>
                {won && <span style={{ fontSize:22 }}>🏆</span>}
              </button>
            );
          })}
        </div>
        {finalWinner && (
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:13, color:"#15803d", fontWeight:800 }}>"{finalWinner.title}" is your {CAT.champion} {year}!</div>
            <button onClick={() => clearVote("final")}
              style={{ fontSize:11, color:"#a8a29e", background:"none", border:"none", marginTop:4, cursor:"pointer", textDecoration:"underline" }}>Change pick</button>
          </div>
        )}
      </div>
    );
  }

  // ── Main bracket view ──
  const pickCount = months.filter(m => m.winner).length;
  const anyR1Ready = R1.some(m => {
    const b1 = months[m.m1]?.winner;
    const b2 = months[m.m2]?.winner;
    return b1 || b2;
  });

  const resetBracket = () => {
    if (confirm("Reset all bracket picks?")) {
      save({ ...data, bracket: {} });
    }
  };

  return (
    <div style={{ padding:16, display:"flex", flexDirection:"column", gap:16 }}>
      {/* Back + label */}
      {onBack && (
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <button onClick={onBack}
            style={{ background:"none", border:"none", color:"#15803d", fontWeight:700, fontSize:13, cursor:"pointer", display:"flex", alignItems:"center", gap:4, padding:0 }}>
            ‹ Back
          </button>
          {label && <span style={{ fontWeight:800, fontSize:15, color:"#1c1917" }}>{label}</span>}
        </div>
      )}

      {/* Top actions */}
      {Object.keys(b).length > 0 && (
        <div style={{ display:"flex", justifyContent:"flex-end", gap:8 }}>
          <button onClick={openShare}
            style={{ padding:"6px 12px", background:"#14532d", border:"none", borderRadius:8, fontSize:12, fontWeight:700, color:"#fff", cursor:"pointer", display:"flex", alignItems:"center", gap:4 }}>
            📤 Share
          </button>
          <button onClick={resetBracket}
            style={{ padding:"6px 12px", background:"#fff", border:"1px solid #e7e5e4", borderRadius:8, fontSize:12, fontWeight:700, color:"#dc2626", cursor:"pointer" }}>
            Reset Bracket
          </button>
        </div>
      )}

      {/* Empty state */}
      {!anyR1Ready && (
        <div style={{ background:"#fff", borderRadius:20, padding:"32px 24px", textAlign:"center", boxShadow:"0 1px 4px #0001" }}>
          <div style={{ fontSize:52, marginBottom:12 }}>{CAT.icon}</div>
          <div style={{ fontWeight:800, fontSize:16, color:"#1c1917", marginBottom:8 }}>Your bracket awaits</div>
          <div style={{ fontSize:13, color:"#9ca3af", lineHeight:1.7, marginBottom:12 }}>
            Pick a favourite {CAT.singular} each month — those winners become your bracket contenders.
          </div>
          <div style={{ display:"inline-flex", alignItems:"center", gap:6, background:"#f0fdf4", borderRadius:99, padding:"6px 14px" }}>
            <span style={{ fontSize:14 }}>⭐</span>
            <span style={{ fontSize:12, fontWeight:700, color:"#15803d" }}>{pickCount} of 12 monthly winners chosen</span>
          </div>
        </div>
      )}

      {anyR1Ready && (
        <div style={{ display:"flex", flexDirection:"column", gap:0, alignItems:"center" }}>

          {/* ── ROUND 1: 6 matchup cards ── */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:10, width:"100%" }}>
            {R1.map(match => {
              const b1 = months[match.m1]?.winner;
              const b2 = months[match.m2]?.winner;
              const winner = b[match.id];
              const autoAdvanced = (b1 && !b2) || (!b1 && b2);
              const advancee = autoAdvanced ? (b1 || b2) : null;
              const ready = b1 && b2 && !winner;

              return (
                <button key={match.id}
                  onClick={() => ready ? setBattleId(match.id) : (winner && setBattleId(match.id))}
                  style={{
                    display:"flex", flexDirection:"column", alignItems:"center", gap:4,
                    padding:"10px 4px", background: (winner || advancee) ? "#f0fdf4" : "#fff",
                    border:`2px solid ${(winner || advancee) ? "#22c55e" : ready ? "#4ade80" : "#e7e5e4"}`,
                    borderRadius:14, cursor: (ready || winner) ? "pointer" : "default",
                    opacity: (!b1 && !b2) ? 0.35 : 1,
                    transition:"all .2s",
                  }}>
                  <div style={{ fontSize:9, fontWeight:800, color:"#78716c", textTransform:"uppercase", letterSpacing:0.5 }}>{match.label}</div>

                  {(winner || advancee) ? (
                    <>
                      <Cover book={winner || advancee} size="sm" />
                      <div style={{ fontSize:9, fontWeight:700, color:"#15803d", lineHeight:1.2, textAlign:"center", maxWidth:80 }}>{(winner || advancee).title}</div>
                      {autoAdvanced && <div style={{ fontSize:8, color:"#9ca3af" }}>auto-advanced</div>}
                    </>
                  ) : ready ? (
                    <div style={{ display:"flex", gap:4, alignItems:"center" }}>
                      <Cover book={b1} size="xs" />
                      <span style={{ fontSize:9, fontWeight:800, color:"#14532d" }}>vs</span>
                      <Cover book={b2} size="xs" />
                    </div>
                  ) : (
                    <div style={{ display:"flex", gap:4, alignItems:"center" }}>
                      {b1 ? <Cover book={b1} size="xs" /> : <div style={{ width:28, height:40, borderRadius:4, background:"#f5f5f4" }} />}
                      <span style={{ fontSize:9, color:"#d6d3d1" }}>vs</span>
                      {b2 ? <Cover book={b2} size="xs" /> : <div style={{ width:28, height:40, borderRadius:4, background:"#f5f5f4" }} />}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Connector R1 → R2 */}
          <div style={{ width:"100%", height:28 }}>
            <svg width="100%" height="28" style={{ overflow:"visible" }}>
              <line x1="16.6%" y1="0" x2="16.6%" y2="10" stroke="#86efac" strokeWidth="2" />
              <line x1="50%" y1="0" x2="50%" y2="10" stroke="#86efac" strokeWidth="2" />
              <line x1="83.3%" y1="0" x2="83.3%" y2="10" stroke="#86efac" strokeWidth="2" />
              <line x1="16.6%" y1="10" x2="25%" y2="28" stroke="#86efac" strokeWidth="2" />
              <line x1="50%" y1="10" x2="50%" y2="28" stroke="#86efac" strokeWidth="2" />
              <line x1="83.3%" y1="10" x2="75%" y2="28" stroke="#86efac" strokeWidth="2" />
            </svg>
          </div>

          {/* ── ROUND 2: 3 matchup cards ── */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:10, width:"85%" }}>
            {R2.map(match => {
              const w1 = r1Winner(R1.find(r => r.id === match.p1));
              const w2 = r1Winner(R1.find(r => r.id === match.p2));
              const winner = b[match.id];
              const autoAdvanced = (w1 && !w2) || (!w1 && w2);
              const advancee = autoAdvanced ? (w1 || w2) : null;
              const ready = w1 && w2 && !winner;

              return (
                <button key={match.id}
                  onClick={() => ready ? setBattleId(match.id) : (winner && setBattleId(match.id))}
                  style={{
                    display:"flex", flexDirection:"column", alignItems:"center", gap:4,
                    padding:"10px 6px", background: (winner || advancee) ? "#f0fdf4" : "#fff",
                    border:`2px solid ${(winner || advancee) ? "#22c55e" : ready ? "#4ade80" : "#e7e5e4"}`,
                    borderRadius:14, cursor: (ready || winner) ? "pointer" : "default",
                    opacity: (!w1 && !w2) ? 0.35 : 1,
                    transition:"all .2s",
                  }}>
                  <div style={{ fontSize:9, fontWeight:800, color:"#78716c", textTransform:"uppercase", letterSpacing:0.5 }}>Round 2</div>

                  {(winner || advancee) ? (
                    <>
                      <Cover book={winner || advancee} size="sm" />
                      <div style={{ fontSize:9, fontWeight:700, color:"#15803d", lineHeight:1.2, textAlign:"center", maxWidth:80 }}>{(winner || advancee).title}</div>
                    </>
                  ) : ready ? (
                    <div style={{ display:"flex", gap:4, alignItems:"center" }}>
                      <Cover book={w1} size="xs" />
                      <span style={{ fontSize:9, fontWeight:800, color:"#14532d" }}>vs</span>
                      <Cover book={w2} size="xs" />
                    </div>
                  ) : (
                    <div style={{ width:40, height:56, borderRadius:6, background:"#f5f5f4", display:"flex", alignItems:"center", justifyContent:"center" }}>
                      <span style={{ fontSize:12, color:"#d6d3d1" }}>?</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Connector R2 → Final */}
          <div style={{ width:"85%", height:28 }}>
            <svg width="100%" height="28" style={{ overflow:"visible" }}>
              <line x1="16.6%" y1="0" x2="50%" y2="28" stroke="#86efac" strokeWidth="2" />
              <line x1="50%" y1="0" x2="50%" y2="28" stroke="#86efac" strokeWidth="2" />
              <line x1="83.3%" y1="0" x2="50%" y2="28" stroke="#86efac" strokeWidth="2" />
            </svg>
          </div>

          {/* ── FINAL: pick #1 from top 3 ── */}
          <div style={{
            background: finalWinner ? "linear-gradient(135deg,#166534,#14532d)" : (top3.length >= 2) ? "linear-gradient(135deg,#166534,#14532d)" : "#fff",
            borderRadius:20, padding:20, textAlign:"center", width:"65%",
            border: finalWinner || top3.length >= 2 ? "none" : "2px solid #e7e5e4",
            color: finalWinner || top3.length >= 2 ? "#fff" : "#1c1917",
            boxShadow: finalWinner ? "0 4px 24px #14532d44" : "0 1px 4px #0001",
            opacity: top3.length >= 2 || finalWinner ? 1 : 0.4,
            transition:"all .3s",
          }}>
            {finalWinner ? (
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:8 }}>
                <div style={{ fontSize:11, opacity:.7, textTransform:"uppercase", letterSpacing:2 }}>{CAT.champion}</div>
                <Cover book={finalWinner} size="xl" />
                <div style={{ fontWeight:800, fontSize:18 }}>{finalWinner.title}</div>
                {finalWinner.author && <div style={{ fontSize:13, opacity:.8 }}>{finalWinner.author}</div>}
                <div style={{ fontSize:22, marginTop:4 }}>{CAT.champion} {year}</div>
                <button onClick={() => clearVote("final")}
                  style={{ fontSize:11, background:"rgba(255,255,255,.2)", border:"none", color:"#fff", padding:"4px 12px", borderRadius:99, marginTop:4, cursor:"pointer" }}>Change pick</button>
              </div>
            ) : top3.length >= 2 ? (
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:10 }}>
                <div style={{ fontSize:11, opacity:.7, textTransform:"uppercase", letterSpacing:2 }}>Your Top {top3.length}</div>
                <div style={{ display:"flex", justifyContent:"center", gap:8, alignItems:"center" }}>
                  {top3.map((book, i) => (
                    <div key={i} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
                      <Cover book={book} size="sm" />
                      <div style={{ fontSize:8, maxWidth:50, textAlign:"center", lineHeight:1.2 }}>{book.title}</div>
                    </div>
                  ))}
                </div>
                <button onClick={() => setTop3Pick(true)}
                  style={{ background:"#fff", color:"#166534", border:"none", padding:"10px 28px", borderRadius:99, fontWeight:800, fontSize:14, cursor:"pointer", boxShadow:"0 2px 8px #0002" }}>
                  Pick your #1
                </button>
              </div>
            ) : (
              <div>
                <div style={{ fontSize:11, color:"#9ca3af", textTransform:"uppercase", letterSpacing:2, marginBottom:8 }}>{CAT.champion}</div>
                <div style={{ width:56, height:80, borderRadius:6, background:"#f5f5f4", margin:"0 auto", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <span style={{ fontSize:18, color:"#d6d3d1" }}>👑</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
