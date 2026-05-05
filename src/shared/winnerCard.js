/**
 * winnerCard.js — Canvas2D renderer for shareable winner-card images.
 *
 * Generic, category-agnostic, single-champion card.  Used by the Share Now
 * button on every victory screen (month winner, custom bracket champion,
 * year champion, round-robin winner).
 *
 * API
 * ───
 *   renderWinnerCard({ book, bracketName, subtitle, aspect }) → Promise<Blob>
 *
 *   book         { title, author, cover }   the champion item
 *   bracketName  string                     e.g. "Best Sci-Fi 2025"
 *   subtitle     string  (optional)         e.g. "January 2026" or "Champion"
 *   aspect       "1:1" | "9:16" | "16:9"   output canvas aspect ratio
 *
 * Layout
 * ──────
 *   1:1  (1080×1080)   vertical stack: trophy / label / cover / title / footer
 *   9:16 (1080×1920)   same vertical stack with bigger cover, more breathing
 *   16:9 (1920×1080)   horizontal split: cover left, text + footer right
 *
 * Implementation notes
 * ────────────────────
 *   - Self-contained (no books-specific imports) so future categories can
 *     reuse it.  Falls back to a gradient with the title baked in when the
 *     cover image is missing or fails CORS.
 *   - Output is a PNG Blob suitable for navigator.share({files}) on mobile
 *     and a generated download link on desktop.
 */

const BG_GRADIENT_TOP    = "#14532d";   // brand green
const BG_GRADIENT_MID    = "#166534";
const BG_GRADIENT_BOTTOM = "#0f3d1f";
const GOLD               = "#fbbf24";
const COVER_FALLBACKS = [
  "#fbbf24", "#22c55e", "#3b82f6", "#ec4899", "#a855f7", "#ef4444", "#06b6d4",
];

const ASPECT_DIMS = {
  "1:1":  { w: 1080, h: 1080 },
  "9:16": { w: 1080, h: 1920 },
  "16:9": { w: 1920, h: 1080 },
};

// ── Helpers ────────────────────────────────────────────────────────────────

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload  = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function wrapText(ctx, text, maxWidth) {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? cur + " " + w : w;
    if (ctx.measureText(test).width > maxWidth && cur) {
      lines.push(cur); cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [text];
}

function drawBackground(ctx, W, H) {
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0,    BG_GRADIENT_TOP);
  grad.addColorStop(0.4,  BG_GRADIENT_MID);
  grad.addColorStop(1,    BG_GRADIENT_BOTTOM);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Subtle dotted overlay — matches existing share.js style
  ctx.fillStyle = "#ffffff08";
  for (let i = 0; i < W; i += 40) {
    for (let j = 0; j < H; j += 40) {
      if ((i + j) % 80 === 0) ctx.fillRect(i, j, 16, 16);
    }
  }

  // Spotlight glow behind cover area
  const spot = ctx.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, Math.max(W, H) * 0.45);
  spot.addColorStop(0, "rgba(251,191,36,0.18)");
  spot.addColorStop(1, "rgba(251,191,36,0)");
  ctx.fillStyle = spot;
  ctx.fillRect(0, 0, W, H);
}

/** Paint the cover image (or a fallback gradient with title baked in). */
function drawCover(ctx, book, x, y, w, h) {
  const r = Math.max(8, Math.floor(w * 0.025));

  // Soft drop shadow
  ctx.save();
  ctx.shadowColor   = "rgba(0,0,0,0.45)";
  ctx.shadowBlur    = 40;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle     = "#000";
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.clip();

  let drawn = false;
  if (book?._coverImg) {
    try {
      const img = book._coverImg;
      const scale = Math.max(w / img.width, h / img.height);
      const sw = img.width * scale;
      const sh = img.height * scale;
      ctx.drawImage(img, x + (w - sw) / 2, y + (h - sh) / 2, sw, sh);
      drawn = true;
    } catch { /* fall through */ }
  }
  if (!drawn) {
    const seed = (book?.title?.charCodeAt(0) || 0) % COVER_FALLBACKS.length;
    const color = COVER_FALLBACKS[seed];
    const grad = ctx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, color + "cc");
    grad.addColorStop(1, color);
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
    // Title baked in as fallback
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${Math.max(20, Math.floor(w * 0.09))}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const lines = wrapText(ctx, book?.title || "?", w - 40);
    const lh = Math.floor(w * 0.11);
    const startY = y + h / 2 - ((lines.length - 1) * lh) / 2;
    lines.slice(0, 4).forEach((ln, i) => ctx.fillText(ln, x + w / 2, startY + i * lh, w - 24));
  }
  ctx.restore();

  // Gold border halo
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.strokeStyle = "rgba(251,191,36,0.55)";
  ctx.lineWidth = Math.max(3, Math.floor(w * 0.008));
  ctx.stroke();
  ctx.restore();
}

// ── Layouts ────────────────────────────────────────────────────────────────

function drawVerticalLayout(ctx, W, H, { book, bracketName, subtitle, isStory }) {
  const CX = W / 2;
  const padX = Math.floor(W * 0.08);

  // Trophy
  let y = isStory ? Math.floor(H * 0.13) : Math.floor(H * 0.07);
  ctx.font = `${Math.floor(W * 0.13)}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("\u{1F3C6}", CX, y + Math.floor(W * 0.1));
  y += Math.floor(W * 0.14);

  // Bracket name (label)
  if (bracketName) {
    ctx.fillStyle = GOLD;
    ctx.font = `800 ${Math.floor(W * 0.038)}px system-ui, -apple-system, sans-serif`;
    ctx.letterSpacing = "6px";
    ctx.textAlign = "center";
    const lines = wrapText(ctx, bracketName.toUpperCase(), W - padX * 2);
    lines.slice(0, 2).forEach((ln, i) => {
      ctx.fillText(ln, CX, y + i * Math.floor(W * 0.046));
    });
    ctx.letterSpacing = "0px";
    y += lines.slice(0, 2).length * Math.floor(W * 0.046);
  }

  // "CHAMPION" sub-label
  ctx.fillStyle = "#ffffffaa";
  ctx.font = `700 ${Math.floor(W * 0.03)}px system-ui, -apple-system, sans-serif`;
  ctx.letterSpacing = "10px";
  ctx.fillText((subtitle || "CHAMPION").toUpperCase(), CX, y + Math.floor(W * 0.04));
  ctx.letterSpacing = "0px";
  y += Math.floor(W * 0.07);

  // Cover
  const footerH = Math.floor(H * 0.08);
  const titleBlockH = Math.floor(W * 0.18);  // reserved space below cover for title + author
  const availH = H - y - footerH - titleBlockH - Math.floor(H * 0.04);
  const maxCoverH = isStory ? Math.floor(H * 0.46) : Math.floor(H * 0.50);
  const coverH = Math.min(maxCoverH, availH);
  const coverW = Math.floor(coverH / 1.5);
  const coverX = CX - coverW / 2;
  drawCover(ctx, book, coverX, y, coverW, coverH);
  y += coverH + Math.floor(W * 0.05);

  // Title
  ctx.fillStyle = "#fff";
  ctx.font = `800 ${Math.floor(W * 0.052)}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = "center";
  const titleLines = wrapText(ctx, book?.title || "Champion", W - padX * 2);
  const visibleTitle = titleLines.slice(0, 2);
  if (titleLines.length > 2) visibleTitle[1] = visibleTitle[1].replace(/\s+\S*$/, "…");
  visibleTitle.forEach((ln, i) => {
    ctx.fillText(ln, CX, y + i * Math.floor(W * 0.058));
  });
  y += visibleTitle.length * Math.floor(W * 0.058) + Math.floor(W * 0.012);

  // Author
  if (book?.author) {
    ctx.fillStyle = "#ffffffaa";
    ctx.font = `500 ${Math.floor(W * 0.032)}px system-ui, -apple-system, sans-serif`;
    ctx.fillText(book.author, CX, y + Math.floor(W * 0.02));
  }

  drawFooter(ctx, W, H);
}

function drawWideLayout(ctx, W, H, { book, bracketName, subtitle }) {
  const padX = Math.floor(W * 0.05);
  // Cover dominates left half
  const coverH = Math.floor(H * 0.78);
  const coverW = Math.floor(coverH / 1.5);
  const coverX = padX;
  const coverY = Math.floor((H - coverH) / 2);
  drawCover(ctx, book, coverX, coverY, coverW, coverH);

  // Right column: trophy + label + title + author
  const rightX     = coverX + coverW + Math.floor(W * 0.05);
  const rightW     = W - rightX - padX;
  const rightCx    = rightX + rightW / 2;
  const rightCenter = H / 2;
  ctx.textAlign = "center";

  // Trophy
  ctx.font = `${Math.floor(H * 0.13)}px system-ui, -apple-system, sans-serif`;
  ctx.fillText("\u{1F3C6}", rightCx, rightCenter - Math.floor(H * 0.20));

  // Bracket name
  let textY = rightCenter - Math.floor(H * 0.05);
  if (bracketName) {
    ctx.fillStyle = GOLD;
    ctx.font = `800 ${Math.floor(H * 0.04)}px system-ui, -apple-system, sans-serif`;
    ctx.letterSpacing = "6px";
    const lines = wrapText(ctx, bracketName.toUpperCase(), rightW);
    lines.slice(0, 2).forEach((ln, i) => {
      ctx.fillText(ln, rightCx, textY + i * Math.floor(H * 0.05));
    });
    ctx.letterSpacing = "0px";
    textY += lines.slice(0, 2).length * Math.floor(H * 0.05);
  }

  // CHAMPION sub-label
  ctx.fillStyle = "#ffffffaa";
  ctx.font = `700 ${Math.floor(H * 0.026)}px system-ui, -apple-system, sans-serif`;
  ctx.letterSpacing = "10px";
  ctx.fillText((subtitle || "CHAMPION").toUpperCase(), rightCx, textY + Math.floor(H * 0.04));
  ctx.letterSpacing = "0px";
  textY += Math.floor(H * 0.085);

  // Title
  ctx.fillStyle = "#fff";
  ctx.font = `800 ${Math.floor(H * 0.05)}px system-ui, -apple-system, sans-serif`;
  const titleLines = wrapText(ctx, book?.title || "Champion", rightW);
  const visibleTitle = titleLines.slice(0, 3);
  if (titleLines.length > 3) visibleTitle[2] = visibleTitle[2].replace(/\s+\S*$/, "…");
  visibleTitle.forEach((ln, i) => {
    ctx.fillText(ln, rightCx, textY + i * Math.floor(H * 0.06));
  });
  textY += visibleTitle.length * Math.floor(H * 0.06);

  if (book?.author) {
    ctx.fillStyle = "#ffffffaa";
    ctx.font = `500 ${Math.floor(H * 0.03)}px system-ui, -apple-system, sans-serif`;
    ctx.fillText(book.author, rightCx, textY + Math.floor(H * 0.02));
  }

  drawFooter(ctx, W, H);
}

function drawFooter(ctx, W, H) {
  // Thin top divider
  const footerY = H - Math.floor(H * 0.07);
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(W * 0.1, footerY);
  ctx.lineTo(W * 0.9, footerY);
  ctx.stroke();

  // Wordmark
  ctx.fillStyle = "#ffffffcc";
  ctx.font = `800 ${Math.floor(Math.min(W, H) * 0.026)}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = "center";
  ctx.letterSpacing = "4px";
  ctx.fillText("THE BRACKET CLUB", W / 2, footerY + Math.floor(H * 0.034));
  ctx.letterSpacing = "0px";

  ctx.fillStyle = "#ffffff88";
  ctx.font = `600 ${Math.floor(Math.min(W, H) * 0.02)}px system-ui, -apple-system, sans-serif`;
  ctx.fillText("thebracket.club", W / 2, footerY + Math.floor(H * 0.058));
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function renderWinnerCard({ book, bracketName, subtitle, aspect = "1:1" }) {
  const dims = ASPECT_DIMS[aspect] || ASPECT_DIMS["1:1"];
  const { w: W, h: H } = dims;

  const canvas = document.createElement("canvas");
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  // Pre-load cover image (CORS-aware; fails silently to fallback)
  if (book?.cover) {
    book._coverImg = await loadImage(book.cover);
  }

  drawBackground(ctx, W, H);

  if (aspect === "16:9") {
    drawWideLayout(ctx, W, H, { book, bracketName, subtitle });
  } else {
    drawVerticalLayout(ctx, W, H, { book, bracketName, subtitle, isStory: aspect === "9:16" });
  }

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png", 0.95));
}

/** Aspect ratios exported for the share sheet UI. */
export const ASPECTS = [
  { id: "1:1",  label: "Square",  hint: "Instagram, Twitter" },
  { id: "9:16", label: "Story",   hint: "IG/TikTok Stories" },
  { id: "16:9", label: "Wide",    hint: "Twitter, Facebook" },
];
