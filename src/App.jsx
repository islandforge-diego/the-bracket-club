import { useState, useEffect, useRef, useCallback } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const FULL   = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const COLORS  = ["#c0392b","#8e44ad","#2980b9","#16a085","#d35400","#27ae60","#e74c3c","#f39c12","#1abc9c","#e67e22","#9b59b6","#2ecc71"];

const R1 = [
  { id:"r1_jf", label:"Jan vs Feb",  m1:0,  m2:1  },
  { id:"r1_ma", label:"Mar vs Apr",  m1:2,  m2:3  },
  { id:"r1_mj", label:"May vs Jun",  m1:4,  m2:5  },
  { id:"r1_ja", label:"Jul vs Aug",  m1:6,  m2:7  },
  { id:"r1_so", label:"Sep vs Oct",  m1:8,  m2:9  },
  { id:"r1_nd", label:"Nov vs Dec",  m1:10, m2:11 },
];

const R2 = [
  { id:"r2_a", label:"Round 2", p1:"r1_jf", p2:"r1_ma" },
  { id:"r2_b", label:"Round 2", p1:"r1_mj", p2:"r1_ja" },
  { id:"r2_c", label:"Round 2", p1:"r1_so", p2:"r1_nd" },
];

const MATCHES = [...R1, ...R2];

// ─── Dynamic Bracket Generator ───────────────────────────────────────────────
function buildBracket(books) {
  if (books.length < 2) return { rounds: [], seeds: books };

  const seeds = [...books];
  const rounds = [];

  const r1 = [];
  let pos = 0;
  const pairCount = Math.floor(seeds.length / 2);
  for (let i = 0; i < pairCount; i++) {
    const match = { id: `r1_${i}`, a: seeds[pos++], b: seeds[pos++] };
    if (i === pairCount - 1 && seeds.length % 2 === 1) {
      match.c = seeds[pos++];
    }
    r1.push(match);
  }
  rounds.push(r1);

  let roundNum = 2;
  while (rounds[rounds.length - 1].length > 1) {
    const prev = rounds[rounds.length - 1];
    const prevLen = prev.length;
    const matchCount = Math.floor(prevLen / 2);
    const rnd = [];
    let fi = 0;
    for (let i = 0; i < matchCount; i++) {
      const match = { id: `r${roundNum}_${i}`, feedA: prev[fi++].id, feedB: prev[fi++].id };
      if (i === matchCount - 1 && prevLen % 2 === 1) {
        match.feedC = prev[fi++].id;
      }
      rnd.push(match);
    }
    rounds.push(rnd);
    roundNum++;
  }
  return { rounds, seeds };
}

function getBracketWinner(matchId, rounds, picks) {
  return picks[matchId] || null;
}

function isMatchEmpty(matchId, rounds) {
  const round = rounds.find(r => r.some(m => m.id === matchId));
  if (!round) return true;
  const match = round.find(m => m.id === matchId);
  if (!match) return true;
  if (match.a !== undefined) return !match.a && !match.b;
  const feedAEmpty = match.feedA ? isMatchEmpty(match.feedA, rounds) : true;
  const feedBEmpty = match.feedB ? isMatchEmpty(match.feedB, rounds) : true;
  return feedAEmpty && feedBEmpty;
}

// ─── Storage ──────────────────────────────────────────────────────────────────
const STORAGE_PREFIX = "botb_";
const store = {
  get: (year) => {
    try { const v = localStorage.getItem(STORAGE_PREFIX + year); return v ? JSON.parse(v) : null; }
    catch { return null; }
  },
  set: (year, val) => {
    try { localStorage.setItem(STORAGE_PREFIX + year, JSON.stringify(val)); }
    catch (e) { console.error("Save failed:", e); }
  },
};

function migrateStorage() {
  const old = localStorage.getItem("botb26");
  if (old && !localStorage.getItem("botb_2026")) {
    localStorage.setItem("botb_2026", old);
  }
  if (old) localStorage.removeItem("botb26");
}

function freshData() {
  return {
    months: MONTHS.map(() => ({ books: [], winner: null })),
    bracket: {},
  };
}

// ─── Goodreads CSV Parser ─────────────────────────────────────────────────────
function parseCSVLine(line) {
  const result = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === ',' && !inQ) {
      result.push(cur); cur = "";
    } else {
      cur += c;
    }
  }
  result.push(cur);
  return result;
}

function parseGoodreadsCSV(text, targetYear) {
  const lines = text.replace(/\r/g, "").split("\n").filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]).map(h => h.trim());
  const books = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i]);
    const row  = {};
    headers.forEach((h, j) => { row[h] = (vals[j] || "").trim(); });

    if (row["Exclusive Shelf"] !== "read") continue;

    const dm = row["Date Read"].match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
    if (!dm) continue;
    const year = parseInt(dm[1]);
    const month = parseInt(dm[2]) - 1;
    if (year !== targetYear || month < 0 || month > 11) continue;

    const rawRating = parseInt(row["My Rating"]);
    books.push({
      title:  row["Title"]  || "",
      author: row["Author"] || "",
      rating: rawRating >= 1 && rawRating <= 5 ? rawRating : null,
      month,
      cover:  "",
    });
  }
  return books;
}

// ─── Goodreads RSS Parser ────────────────────────────────────────────────────
function extractGoodreadsUserId(input) {
  const m = input.match(/goodreads\.com\/review\/list(?:_rss)?\/(\d+)/);
  return m ? m[1] : null;
}

async function fetchGoodreadsRSS(userId, page = 1) {
  const rssPath = `/review/list_rss/${userId}?shelf=read&per_page=200&page=${page}`;
  const res = await fetch(`/api/goodreads?path=${encodeURIComponent(rssPath)}`);
  if (!res.ok) throw new Error("Failed to fetch Goodreads data");
  return await res.text();
}

function parseGoodreadsRSS(xmlText, targetYear) {
  return parseGoodreadsRSSAll(xmlText).filter(b => b.year === targetYear);
}

function parseGoodreadsRSSAll(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "text/xml");
  const items = doc.querySelectorAll("item");
  const books = [];

  items.forEach(item => {
    const dateStr = item.querySelector("user_read_at")?.textContent?.trim();
    if (!dateStr) return;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return;

    const title = item.querySelector("title")?.textContent?.trim() || "";
    const author = item.querySelector("author_name")?.textContent?.trim() || "";
    const cover = item.querySelector("book_image_url")?.textContent?.trim() || "";
    const ratingStr = item.querySelector("user_rating")?.textContent?.trim();
    const rating = parseInt(ratingStr);

    books.push({
      title,
      author,
      rating: rating >= 1 && rating <= 5 ? rating : null,
      year: d.getFullYear(),
      month: d.getMonth(),
      cover: cover && !cover.includes("nophoto") ? cover : "",
    });
  });
  return books;
}

async function fetchAllGoodreadsBooks(userId) {
  const allBooks = [];
  for (let page = 1; page <= 10; page++) {
    const xml = await fetchGoodreadsRSS(userId, page);
    const books = parseGoodreadsRSSAll(xml);
    if (books.length === 0) break;
    allBooks.push(...books);
    if (books.length < 200) break;
  }
  return allBooks;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getR1Winner(match, months, bracket) {
  if (bracket[match.id]) return bracket[match.id];
  const b1 = months[match.m1]?.winner;
  const b2 = months[match.m2]?.winner;
  if (b1 && !b2) return b1;
  if (b2 && !b1) return b2;
  return null;
}

function getBooks(match, months, bracket) {
  if (match.m1 !== undefined) {
    return { b1: months[match.m1]?.winner || null, b2: months[match.m2]?.winner || null };
  }
  const r1a = R1.find(r => r.id === match.p1);
  const r1b = R1.find(r => r.id === match.p2);
  return {
    b1: r1a ? getR1Winner(r1a, months, bracket) : (bracket[match.p1] || null),
    b2: r1b ? getR1Winner(r1b, months, bracket) : (bracket[match.p2] || null),
  };
}

async function shareProgress(data, year) {
  const lines = [`⚔️ The Bracket Club — Battle of the Books ${year}`, ""];
  const champion = data.bracket["final"];
  if (champion) {
    lines.push(`🏆 Best Read of ${year}: "${champion.title}"${champion.author ? ` by ${champion.author}` : ""}`, "");
  }
  const hasWinners = data.months.some(m => m.winner);
  if (hasWinners) {
    lines.push("📚 Monthly Champions:");
    data.months.forEach((m, i) => {
      if (m.winner) lines.push(`  ${MONTHS[i]}: ${m.winner.title}`);
    });
  } else {
    lines.push("Just getting started — 0 months crowned!");
  }
  lines.push("", "🌐 thebracket.club");
  const text = lines.join("\n");
  try {
    if (navigator.share) {
      await navigator.share({ title: "The Bracket Club", text });
      return "shared";
    } else {
      await navigator.clipboard.writeText(text);
      return "copied";
    }
  } catch (e) {
    if (e.name !== "AbortError") {
      try { await navigator.clipboard.writeText(text); return "copied"; } catch {}
    }
    return "cancelled";
  }
}

// ─── Share Image Generator ───────────────────────────────────────────────────
function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function drawCover(ctx, book, x, y, w, h) {
  const color = COLORS[(book?.title?.charCodeAt(0) || 0) % COLORS.length];
  const r = 8;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.clip();

  let drawn = false;
  if (book?._coverImg) {
    try {
      const img = book._coverImg;
      const scale = Math.max(w / img.width, h / img.height);
      const sw = img.width * scale, sh = img.height * scale;
      ctx.drawImage(img, x + (w - sw) / 2, y + (h - sh) / 2, sw, sh);
      drawn = true;
    } catch {}
  }
  if (!drawn) {
    const grad = ctx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, color + "bb");
    grad.addColorStop(1, color);
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${Math.max(10, w * 0.12)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const title = book?.title?.slice(0, 18) || "?";
    ctx.fillText(title, x + w / 2, y + h / 2, w - 8);
  }
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.strokeStyle = "#00000022";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

async function generateShareImage(data, year) {
  const W = 1080, H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  const safeTop = 50, safeBot = 110;
  const CX = W / 2 - 20;
  const PAD = 40;

  const months = data.months;
  const b = data.bracket || {};
  const champion = b["final"];
  const bookCount = months.reduce((n, m) => n + m.books.length, 0);
  const starCount = months.filter(m => m.winner).length;
  const filledMonths = months.map((m, i) => ({ ...m, idx: i })).filter(m => m.winner);

  const r1Winners = R1.map(match => getR1Winner(match, months, b));
  const top3 = R2.map(match => {
    if (b[match.id]) return b[match.id];
    const w1 = r1Winners[R1.findIndex(r => r.id === match.p1)];
    const w2 = r1Winners[R1.findIndex(r => r.id === match.p2)];
    if (w1 && !w2) return w1;
    if (w2 && !w1) return w2;
    return null;
  }).filter(Boolean);

  const allBooks = [...months.map(m => m.winner).filter(Boolean), ...top3, champion].filter(Boolean);
  const unique = [...new Map(allBooks.map(bk => [bk.id || bk.title, bk])).values()];
  await Promise.all(unique.map(async (bk) => { bk._coverImg = await loadImage(bk.cover); }));

  // ── Background ──
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, "#14532d");
  bgGrad.addColorStop(0.35, "#166534");
  bgGrad.addColorStop(1, "#0f3d1f");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#ffffff06";
  for (let i = 0; i < W; i += 40) {
    for (let j = 0; j < H; j += 40) {
      if ((i + j) % 80 === 0) ctx.fillRect(i, j, 20, 20);
    }
  }

  // ── Header ──
  let y = safeTop + 10;
  ctx.fillStyle = "#fff";
  ctx.font = "bold 62px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.letterSpacing = "12px";
  ctx.fillText("THE BRACKET CLUB", CX, y);
  ctx.letterSpacing = "0px";
  y += 76;

  ctx.fillStyle = "#ffffff88";
  ctx.font = "600 36px system-ui, sans-serif";
  ctx.fillText(`Battle of the Books ${year}`, CX, y);
  y += 56;

  ctx.strokeStyle = "#ffffff33";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD + 40, y);
  ctx.lineTo(W - PAD - 40, y);
  ctx.stroke();
  y += 20;

  const usableW = W - PAD * 2;
  const footerStart = H - safeBot;

  // ── Section 1: Monthly Picks (only show filled months) ──
  ctx.fillStyle = "#ffffffcc";
  ctx.font = "800 32px system-ui, sans-serif";
  ctx.letterSpacing = "6px";
  ctx.fillText("MONTHLY PICKS", CX, y);
  ctx.letterSpacing = "0px";
  y += 44;

  if (filledMonths.length > 0) {
    const cols = Math.min(filledMonths.length, 6);
    const rows = Math.ceil(filledMonths.length / cols);
    const maxCoverH = Math.min(180, Math.floor((footerStart - y - 500) / rows - 44));
    const cw = Math.floor(maxCoverH / 1.45);
    const cg = Math.min(24, Math.floor((usableW - cols * cw) / Math.max(cols - 1, 1)));
    const totalGridW = cols * cw + (cols - 1) * cg;
    const gridX = CX - totalGridW / 2;

    for (let fi = 0; fi < filledMonths.length; fi++) {
      const fm = filledMonths[fi];
      const col = fi % cols, row = Math.floor(fi / cols);
      const x = gridX + col * (cw + cg);
      const cy = y + row * (maxCoverH + 44);

      ctx.fillStyle = "#00000077";
      ctx.beginPath();
      const lblW = cw + 12, lblH = 28;
      ctx.roundRect(x + cw / 2 - lblW / 2, cy - 4, lblW, lblH, 5);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "800 22px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(MONTHS[fm.idx].toUpperCase(), x + cw / 2, cy + 2);

      drawCover(ctx, fm.winner, x, cy + 28, cw, maxCoverH);
    }
    y += rows * (maxCoverH + 44) + 12;
  } else {
    ctx.fillStyle = "#ffffff44";
    ctx.font = "500 28px system-ui, sans-serif";
    ctx.fillText("No monthly picks yet", CX, y + 10);
    y += 50;
  }

  // ── Section 2: Top 3 Books ──
  ctx.strokeStyle = "#ffffff22";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD + 20, y);
  ctx.lineTo(W - PAD - 20, y);
  ctx.stroke();
  y += 16;

  ctx.fillStyle = "#ffffffcc";
  ctx.font = "800 32px system-ui, sans-serif";
  ctx.letterSpacing = "6px";
  ctx.textAlign = "center";
  ctx.fillText("TOP 3", CX, y);
  ctx.letterSpacing = "0px";
  y += 44;

  const remainingForT3AndBoty = footerStart - y;
  const t3Section = champion ? Math.floor(remainingForT3AndBoty * 0.45) : Math.floor(remainingForT3AndBoty * 0.65);
  const t3H = Math.min(260, t3Section - 60);
  const t3W = Math.floor(t3H / 1.45);
  const actualCount = top3.length;
  const t3Gap = actualCount > 1 ? Math.min(28, Math.floor((usableW - actualCount * t3W) / (actualCount - 1))) : 0;
  const t3TotalW = actualCount * t3W + Math.max(0, actualCount - 1) * t3Gap;
  const t3X = CX - t3TotalW / 2;

  for (let i = 0; i < actualCount; i++) {
    const book = top3[i];
    const x = t3X + i * (t3W + t3Gap);
    drawCover(ctx, book, x, y, t3W, t3H);

    ctx.font = "800 24px system-ui, sans-serif";
    ctx.textAlign = "center";
    const titleLines = wrapText(ctx, book.title, t3W + 30);
    const displayLines = titleLines.slice(0, 2);
    if (titleLines.length > 2) displayLines[1] = displayLines[1].replace(/\s+\S*$/, "…");
    const tlH = displayLines.length * 30 + 10;
    ctx.fillStyle = "#00000066";
    ctx.beginPath();
    ctx.roundRect(x - 8, y + t3H + 8, t3W + 16, tlH, 8);
    ctx.fill();
    ctx.fillStyle = "#fff";
    displayLines.forEach((line, li) => {
      ctx.fillText(line, x + t3W / 2, y + t3H + 30 + li * 30);
    });
  }

  if (actualCount === 0) {
    ctx.fillStyle = "#ffffff44";
    ctx.font = "500 28px system-ui, sans-serif";
    ctx.fillText("Keep reading to fill your Top 3!", CX, y + 20);
    y += 60;
  } else {
    y += t3H + (actualCount > 0 ? 80 : 0);
  }

  // ── Section 3: Book of the Year ──
  ctx.strokeStyle = "#ffffff22";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD + 20, y);
  ctx.lineTo(W - PAD - 20, y);
  ctx.stroke();
  y += 16;

  if (champion) {
    const botySpace = footerStart - y - 10;
    const champH = Math.min(220, botySpace - 40);
    const champW = Math.floor(champH / 1.45);
    const boxW = Math.min(usableW, champW + 400);
    const boxH = champH + 40;
    const boxX = CX - boxW / 2;

    ctx.fillStyle = "#fbbf2415";
    ctx.beginPath();
    ctx.roundRect(boxX, y, boxW, boxH, 20);
    ctx.fill();
    ctx.strokeStyle = "#fbbf2455";
    ctx.lineWidth = 2;
    ctx.stroke();

    const coverX = boxX + 28;
    drawCover(ctx, champion, coverX, y + 20, champW, champH);

    const textX = coverX + champW + 32;
    const textMaxW = boxX + boxW - textX - 24;

    ctx.fillStyle = "#fbbf24";
    ctx.font = "800 28px system-ui, sans-serif";
    ctx.letterSpacing = "5px";
    ctx.textAlign = "left";
    ctx.fillText("BOOK OF THE YEAR", textX, y + 40);
    ctx.letterSpacing = "0px";

    ctx.fillStyle = "#fff";
    ctx.font = "bold 38px system-ui, sans-serif";
    const champLines = wrapText(ctx, champion.title, textMaxW);
    champLines.slice(0, 2).forEach((line, li) => {
      ctx.fillText(line, textX, y + 86 + li * 46);
    });

    if (champion.author) {
      const authY = y + 86 + Math.min(champLines.length, 2) * 46 + 10;
      ctx.fillStyle = "#ffffffbb";
      ctx.font = "500 28px system-ui, sans-serif";
      ctx.fillText(champion.author, textX, authY);
    }

    ctx.fillStyle = "#fbbf24";
    ctx.font = "56px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("🏆", textX + textMaxW / 2, y + champH - 10);
  } else {
    ctx.fillStyle = "#ffffff15";
    ctx.beginPath();
    ctx.roundRect(CX - 160, y, 320, 110, 16);
    ctx.fill();
    ctx.fillStyle = "#ffffff66";
    ctx.font = "800 28px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("BOOK OF THE YEAR", CX, y + 42);
    ctx.font = "44px system-ui, sans-serif";
    ctx.fillText("👑", CX, y + 82);
  }

  // ── Stats Footer ──
  const footerY = footerStart + 8;
  ctx.strokeStyle = "#ffffff22";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD + 20, footerY);
  ctx.lineTo(W - PAD - 20, footerY);
  ctx.stroke();

  ctx.fillStyle = "#ffffffcc";
  ctx.font = "700 30px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`${bookCount} books read  ·  ${starCount} months crowned`, CX, footerY + 34);

  ctx.fillStyle = "#ffffffaa";
  ctx.font = "700 26px system-ui, sans-serif";
  ctx.fillText("thebracket.club", CX, footerY + 72);

  return new Promise(resolve => canvas.toBlob(resolve, "image/png"));
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    const test = current ? current + " " + word : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [text];
}

async function shareImage(data, year) {
  const blob = await generateShareImage(data, year);
  const file = new File([blob], `bracket-club-${year}.png`, { type: "image/png" });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "The Bracket Club" });
      return "shared";
    } catch (e) {
      if (e.name === "AbortError") return "cancelled";
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bracket-club-${year}.png`;
  a.click();
  URL.revokeObjectURL(url);
  return "downloaded";
}

// ─── Cover Component ──────────────────────────────────────────────────────────
const COVER_SIZES = { xs:[28,40], sm:[40,56], md:[56,80], lg:[96,128], xl:[128,176] };

function Cover({ book, size = "md" }) {
  const [w, h] = COVER_SIZES[size];
  const [err, setErr] = useState(false);
  const color = COLORS[(book?.title?.charCodeAt(0) || 0) % COLORS.length];
  const base = { width:w, height:h, borderRadius:6, flexShrink:0, boxShadow:"0 1px 4px #0002" };

  if (book?.cover && !err) {
    return (
      <img
        src={book.cover}
        alt={book.title}
        style={{ ...base, objectFit:"cover" }}
        onError={() => setErr(true)}
      />
    );
  }
  return (
    <div style={{
      ...base,
      background: `linear-gradient(160deg, ${color}bb, ${color})`,
      display:"flex", alignItems:"flex-end", justifyContent:"center",
      paddingBottom:4, paddingLeft:3, paddingRight:3,
    }}>
      <span style={{
        color:"#fff", textAlign:"center", fontWeight:700,
        lineHeight:1.2, fontSize: h > 80 ? 9 : 7, wordBreak:"break-word",
      }}>
        {book?.title?.slice(0, 22) || "?"}
      </span>
    </div>
  );
}

// ─── Book Search (Open Library) ───────────────────────────────────────────────
function BookSearch({ onSelect, onManual }) {
  const [query, setQuery]     = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen]       = useState(false);
  const timerRef = useRef(null);
  const wrapRef  = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const doSearch = useCallback(async (q) => {
    if (!q.trim()) { setResults([]); setLoading(false); return; }
    setLoading(true);
    try {
      const res  = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&fields=title,author_name,cover_i&limit=6`);
      const data = await res.json();
      setResults((data.docs || []).map(d => ({
        title:  d.title || "",
        author: d.author_name?.[0] || "",
        cover:  d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : "",
      })));
      setOpen(true);
    } catch {
      setResults([]);
    }
    setLoading(false);
  }, []);

  const handleChange = (e) => {
    const q = e.target.value;
    setQuery(q);
    clearTimeout(timerRef.current);
    if (q.trim()) {
      timerRef.current = setTimeout(() => doSearch(q), 420);
    } else {
      setResults([]);
      setOpen(false);
    }
  };

  const pick = (book) => {
    onSelect(book);
    setQuery("");
    setResults([]);
    setOpen(false);
  };

  const showDropdown = open && (results.length > 0 || (query.trim() && !loading));

  return (
    <div ref={wrapRef} style={{ position:"relative" }}>
      <div style={{
        display:"flex", alignItems:"center", gap:8,
        border:"1.5px solid #e7e5e4", borderRadius:12,
        padding:"9px 12px", background:"#fff",
      }}>
        <span style={{ fontSize:16, flexShrink:0 }}>{loading ? "⏳" : "🔍"}</span>
        <input
          value={query}
          onChange={handleChange}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search for a book..."
          style={{ border:"none", outline:"none", flex:1, fontSize:13, background:"transparent", color:"#1c1917" }}
        />
        {query && (
          <button
            onClick={() => { setQuery(""); setResults([]); setOpen(false); }}
            style={{ background:"none", border:"none", color:"#a8a29e", fontSize:14, cursor:"pointer", padding:0, flexShrink:0 }}
          >✕</button>
        )}
      </div>

      {showDropdown && (
        <div style={{
          position:"absolute", top:"calc(100% + 6px)", left:0, right:0,
          background:"#fff", borderRadius:14, boxShadow:"0 8px 30px #0003",
          zIndex:100, overflow:"hidden", border:"1px solid #e7e5e4",
        }}>
          {results.length > 0 ? (
            results.map((book, i) => (
              <button
                key={i}
                onClick={() => pick(book)}
                style={{
                  width:"100%", display:"flex", alignItems:"center", gap:10,
                  padding:"10px 12px", border:"none",
                  borderBottom: i < results.length - 1 ? "1px solid #f5f5f4" : "none",
                  background:"none", cursor:"pointer", textAlign:"left",
                }}
              >
                <Cover book={book} size="xs" />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:13, color:"#1c1917", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    {book.title}
                  </div>
                  <div style={{ fontSize:11, color:"#78716c", marginTop:1 }}>
                    {book.author || "Unknown author"}
                  </div>
                </div>
                <span style={{ color:"#d6d3d1", fontSize:16, flexShrink:0 }}>+</span>
              </button>
            ))
          ) : (
            <div style={{ padding:"14px 12px", fontSize:13, color:"#a8a29e", textAlign:"center" }}>
              No results found
            </div>
          )}
          <button
            onClick={() => { setOpen(false); onManual(); }}
            style={{
              width:"100%", padding:"10px 12px", border:"none",
              borderTop:"1px solid #f5f5f4", background:"#fafaf9",
              color:"#78716c", fontSize:12, cursor:"pointer", textAlign:"left",
            }}
          >
            ✏️ Add manually instead
          </button>
        </div>
      )}
    </div>
  );
}

// ─── App Shell ────────────────────────────────────────────────────────────────
export default function App() {
  const [data,     setData]     = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [view,     setView]     = useState("home");
  const [monthIdx, setMonthIdx] = useState(new Date().getMonth());
  const [battleId, setBattleId] = useState(null);
  const [year,     setYear]     = useState(new Date().getFullYear());

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
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!loading) {
      setData(store.get(year) || freshData());
      setBattleId(null);
    }
  }, [year]);

  const save = (nd) => { setData({ ...nd }); store.set(year, nd); };

  const NAV = [
    { v:"home",    icon:"🏠", lbl:"Home"    },
    { v:"month",   icon:"📖", lbl:FULL[new Date().getMonth()] },
    { v:"bracket", icon:"🏆", lbl:"Bracket" },
  ];

  const VIEWS = ["home", "month", "bracket"];
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
              <Home data={data} save={save} curM={curM} year={year} setYear={setYear} goMonth={i => { setMonthIdx(i); setView("month"); }} goBracket={() => setView("bracket")} goImport={() => setView("import")} />
            </div>
            <div style={{ width:"33.333%", height:"100%", overflowY:"auto", WebkitOverflowScrolling:"touch", overscrollBehavior:"none" }}>
              <Month data={data} save={save} idx={monthIdx} setIdx={setMonthIdx} />
            </div>
            <div style={{ width:"33.333%", height:"100%", overflowY:"auto", WebkitOverflowScrolling:"touch", overscrollBehavior:"none" }}>
              <Bracket data={data} save={save} battleId={battleId} setBattleId={setBattleId} year={year} />
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
              onClick={() => { if (v === "month") setMonthIdx(curM); setBattleId(null); setView(v); }}
              style={{ flex:1, padding:"10px 0", display:"flex", flexDirection:"column", alignItems:"center", gap:2, fontSize:11, fontWeight:700, border:"none", background:view===v?"#f0fdf4":"#fff", color:view===v?"#166534":"#9ca3af", cursor:"pointer" }}
            >
              <span style={{ fontSize:20 }}>{icon}</span>{lbl}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Home ─────────────────────────────────────────────────────────────────────
function Home({ data, curM, year, setYear, goMonth, goBracket, goImport }) {
  const [shareMsg, setShareMsg] = useState("");
  const thisYear = new Date().getFullYear();
  const picks      = data.months.map(m => m.winner);
  const count      = picks.filter(Boolean).length;
  const curPick    = picks[curM];
  const curBooks   = data.months[curM].books || [];
  const readyMatch = MATCHES.find(m => {
    if (data.bracket[m.id]) return false;
    const { b1, b2 } = getBooks(m, data.months, data.bracket);
    return b1 && b2;
  });

  const handleShare = async () => {
    setShareMsg("Creating...");
    const result = await shareImage(data, year);
    if (result === "downloaded") {
      setShareMsg("Saved!");
      setTimeout(() => setShareMsg(""), 2500);
    } else if (result === "shared") {
      setShareMsg("Shared!");
      setTimeout(() => setShareMsg(""), 2500);
    } else {
      setShareMsg("");
    }
  };

  return (
    <div style={{ padding:"4px 12px", display:"flex", flexDirection:"column", gap:6, height:"100%", boxSizing:"border-box" }}>

      {/* ── Year Reads grid ── */}
      <div style={{ background:"#fff", borderRadius:16, padding:"6px 10px", boxShadow:"0 1px 4px #0001", flex:1, display:"flex", flexDirection:"column" }}>
        <div style={{ display:"flex", justifyContent:"center", alignItems:"center", gap:8, marginBottom:4 }}>
          <button onClick={() => setYear(y => y - 1)} disabled={year <= 2015} style={{ width:26, height:26, borderRadius:99, border:"1px solid #e7e5e4", background:"#fff", fontSize:13, cursor:year<=2015?"default":"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:year<=2015?"#d6d3d1":"#14532d", padding:0 }}>‹</button>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontWeight:800, fontSize:15, color:"#1c1917" }}>{year} Reads</div>
            <div style={{ fontSize:10, color:"#9ca3af", fontWeight:600 }}>{count} of 12 picks</div>
          </div>
          <button onClick={() => setYear(y => y + 1)} disabled={year >= thisYear + 1} style={{ width:26, height:26, borderRadius:99, border:"1px solid #e7e5e4", background:"#fff", fontSize:13, cursor:year>=thisYear+1?"default":"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:year>=thisYear+1?"#d6d3d1":"#14532d", padding:0 }}>›</button>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:6, flex:1 }}>
          {MONTHS.map((m, i) => {
            const pick = picks[i];
            const isCur = i === curM;
            const hasBooksButNoPick = !pick && (data.months[i].books?.length > 0);
            return (
              <button key={m} onClick={() => goMonth(i)} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:3, border:"none", background:"none", cursor:"pointer", padding:0 }}>
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

      {/* ── Bottom row: Share Month + Import + Share ── */}
      <div style={{ display:"flex", gap:8, flexShrink:0 }}>
        <button onClick={() => {}} style={{ flex:1, background:"#fff", border:"1px solid #e7e5e4", borderRadius:12, padding:"9px 8px", display:"flex", alignItems:"center", justifyContent:"center", gap:5, cursor:"pointer" }}>
          <span style={{ fontSize:15 }}>🗓️</span>
          <span style={{ fontWeight:700, color:"#14532d", fontSize:12 }}>Share Month</span>
        </button>
        <button onClick={goImport} style={{ flex:1, background:"#fff", border:"1px solid #e7e5e4", borderRadius:12, padding:"9px 8px", display:"flex", alignItems:"center", justifyContent:"center", gap:5, cursor:"pointer" }}>
          <span style={{ fontSize:15 }}>📥</span>
          <span style={{ fontWeight:700, color:"#14532d", fontSize:12 }}>Import</span>
        </button>
        {count >= 1 && (
          <button onClick={handleShare} style={{ flex:1, background:"#fff", border:"1px solid #e7e5e4", borderRadius:12, padding:"9px 8px", display:"flex", alignItems:"center", justifyContent:"center", gap:5, cursor:"pointer" }}>
            <span style={{ fontSize:15 }}>📤</span>
            <span style={{ fontWeight:700, color:"#14532d", fontSize:12 }}>{shareMsg || "Share"}</span>
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
          setBooks(prev => prev.map((b, j) => j === i ? { ...b, cover:`https://covers.openlibrary.org/b/id/${cid}-M.jpg` } : b));
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
function Month({ data, save, idx, setIdx }) {
  const [showManual,   setShowManual]   = useState(false);
  const [form,         setForm]         = useState({ title:"", author:"", cover:"" });
  const [monthBattle,  setMonthBattle]  = useState(null);
  const [showBracket,  setShowBracket]  = useState(false);
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
                  style={{ flex:1, border:`2px solid ${won?"#22c55e":"#e7e5e4"}`, borderRadius:18, padding: isTriple ? "12px 6px" : "16px 10px", display:"flex", flexDirection:"column", alignItems:"center", gap: isTriple ? 6 : 10, background:won?"#f0fdf4":lost?"#fafaf9":"#fff", transform:won?"scale(1.04)":lost?"scale(.96)":"scale(1)", opacity:lost?0.45:1, boxShadow:won?"0 4px 20px #22c55e44":"0 1px 4px #0001", transition:"all .2s", cursor:"pointer" }}>
                  <Cover book={book} size={isTriple ? "md" : "lg"} />
                  <div style={{ textAlign:"center" }}>
                    <div style={{ fontWeight:800, fontSize: isTriple ? 11 : 13, color:"#1c1917", lineHeight:1.2 }}>{book?.title}</div>
                    {book?.author && <div style={{ fontSize: isTriple ? 9 : 11, color:"#78716c", marginTop:2 }}>{book.author}</div>}
                  </div>
                  {won && <span style={{ fontSize: isTriple ? 18 : 22 }}>🏆</span>}
                </button>
              );
            })}
            {!isTriple && <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", background:"#14532d", color:"#fff", borderRadius:99, width:30, height:30, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:800, boxShadow:"0 2px 8px #14532d66", zIndex:5, pointerEvents:"none" }}>VS</div>}
          </div>
          {winner && (
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:13, color:"#15803d", fontWeight:800 }}>"{winner.title}" advances!</div>
              <button onClick={() => monthClearVote(monthBattle)}
                style={{ fontSize:11, color:"#a8a29e", background:"none", border:"none", marginTop:4, cursor:"pointer", textDecoration:"underline" }}>Change pick</button>
            </div>
          )}
        </div>
      );
    }
  }

  // ── Monthly pick: special 3-book view ──
  if (showBracket && m.books.length >= 2 && m.books.length <= 3) {
    return (
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
                style={{ flex:1, maxWidth:140, border:`2px solid ${won?"#22c55e":"#e7e5e4"}`, borderRadius:18, padding:"16px 10px", display:"flex", flexDirection:"column", alignItems:"center", gap:10, background:won?"#f0fdf4":lost?"#fafaf9":"#fff", transform:won?"scale(1.04)":lost?"scale(.96)":"scale(1)", opacity:lost?0.4:1, boxShadow:won?"0 4px 20px #22c55e44":"0 1px 4px #0001", transition:"all .2s", cursor:"pointer" }}>
                <Cover book={book} size="lg" />
                <div style={{ textAlign:"center" }}>
                  <div style={{ fontWeight:800, fontSize:12, color:"#1c1917", lineHeight:1.3 }}>{book.title}</div>
                  {book.author && <div style={{ fontSize:10, color:"#78716c", marginTop:2 }}>{book.author}</div>}
                </div>
                {won && <span style={{ fontSize:22 }}>⭐</span>}
              </button>
            );
          })}
        </div>
        {m.winner && (
          <div style={{ textAlign:"center", fontSize:13, color:"#15803d", fontWeight:800 }}>
            "{m.winner.title}" is your pick!
          </div>
        )}
      </div>
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
          ? "Add books you read this month, then pick your favourite."
          : m.winner
          ? `⭐ ${m.winner.title} is your pick for the bracket.`
          : "Add your books, then use the bracket to pick your favourite."}
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
        <BookSearch onSelect={addBook} onManual={() => setShowManual(true)} />
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

// ─── Bracket ──────────────────────────────────────────────────────────────────
function Bracket({ data, save, battleId, setBattleId, year }) {
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
          ‹ Back to bracket
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
          <div style={{ fontWeight:800, fontSize:20, color:"#1c1917", marginTop:4 }}>Pick your Book of the Year</div>
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
                </div>
                {won && <span style={{ fontSize:22 }}>🏆</span>}
              </button>
            );
          })}
        </div>
        {finalWinner && (
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:13, color:"#15803d", fontWeight:800 }}>"{finalWinner.title}" is your Best Read of {year}!</div>
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
      {/* Top actions */}
      {Object.keys(b).length > 0 && (
        <div style={{ display:"flex", justifyContent:"flex-end", gap:8 }}>
          <button onClick={async () => { const r = await shareImage(data, year); }}
            style={{ padding:"6px 12px", background:"#14532d", border:"none", borderRadius:8, fontSize:12, fontWeight:700, color:"#fff", cursor:"pointer", display:"flex", alignItems:"center", gap:4 }}>
            📤 Share Bracket
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
          <div style={{ fontSize:52, marginBottom:12 }}>📚</div>
          <div style={{ fontWeight:800, fontSize:16, color:"#1c1917", marginBottom:8 }}>Build your bracket</div>
          <div style={{ fontSize:13, color:"#9ca3af", lineHeight:1.7 }}>
            Star your favourite book each month to start filling in the bracket.
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
                <div style={{ fontSize:11, opacity:.7, textTransform:"uppercase", letterSpacing:2 }}>Book of the Year</div>
                <Cover book={finalWinner} size="xl" />
                <div style={{ fontWeight:800, fontSize:18 }}>{finalWinner.title}</div>
                {finalWinner.author && <div style={{ fontSize:13, opacity:.8 }}>{finalWinner.author}</div>}
                <div style={{ fontSize:22, marginTop:4 }}>Best Read of {year}</div>
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
                <div style={{ fontSize:11, color:"#9ca3af", textTransform:"uppercase", letterSpacing:2, marginBottom:8 }}>Book of the Year</div>
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
