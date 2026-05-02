import { MONTHS, COLORS, R1, R2 } from '../../shared/constants.js';
import { getR1Winner } from '../../shared/bracket.js';

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

function drawCover(ctx, item, x, y, w, h) {
  const color = COLORS[(item?.title?.charCodeAt(0) || 0) % COLORS.length];
  const r = 8;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.clip();

  let drawn = false;
  if (item?._coverImg) {
    try {
      const img = item._coverImg;
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
    const title = item?.title?.slice(0, 18) || "?";
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

function drawCardBg(ctx, W, H) {
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
}

function drawCardHeader(ctx, W, year) {
  const CX = W / 2;
  let y = 60;
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
  ctx.moveTo(80, y);
  ctx.lineTo(W - 80, y);
  ctx.stroke();
  return y + 20;
}

function drawCardFooter(ctx, W, H, itemCount, starCount) {
  const CX = W / 2;
  const footerY = H - 102;
  ctx.strokeStyle = "#ffffff22";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(60, footerY);
  ctx.lineTo(W - 60, footerY);
  ctx.stroke();
  ctx.fillStyle = "#ffffffcc";
  ctx.font = "700 30px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`${itemCount} books read  ·  ${starCount} months crowned`, CX, footerY + 34);
  ctx.fillStyle = "#ffffffaa";
  ctx.font = "700 26px system-ui, sans-serif";
  ctx.fillText("thebracket.club", CX, footerY + 72);
}

export async function generateMonthlyCard(data, year) {
  const W = 1080, H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  const CX = W / 2;
  const months = data.months;
  const itemCount = months.reduce((n, m) => n + m.books.length, 0);
  const starCount = months.filter(m => m.winner).length;

  const winners = months.map(m => m.winner).filter(Boolean);
  const unique = [...new Map(winners.map(b => [b.id || b.title, b])).values()];
  await Promise.all(unique.map(async (bk) => { bk._coverImg = await loadImage(bk.cover); }));

  drawCardBg(ctx, W, H);
  let y = drawCardHeader(ctx, W, year);

  ctx.fillStyle = "#ffffffcc";
  ctx.font = "800 36px system-ui, sans-serif";
  ctx.letterSpacing = "6px";
  ctx.textAlign = "center";
  ctx.fillText("MONTHLY PICKS", CX, y);
  ctx.letterSpacing = "0px";
  y += 54;

  const cols = 4, rows = 3;
  const footerStart = H - 110;
  const availH = footerStart - y - 10;
  const gapX = 20, gapY = 12;
  const cellH = Math.floor((availH - (rows - 1) * gapY) / rows);
  const labelH = 34;
  const coverH = cellH - labelH - 6;
  const coverW = Math.floor(coverH / 1.45);
  const totalGridW = cols * coverW + (cols - 1) * gapX;
  const gridX = CX - totalGridW / 2;

  for (let i = 0; i < 12; i++) {
    const col = i % cols, row = Math.floor(i / cols);
    const x = gridX + col * (coverW + gapX);
    const cy = y + row * (cellH + gapY);
    const winner = months[i].winner;

    ctx.fillStyle = "#00000066";
    ctx.beginPath();
    const lblW = coverW + 8;
    ctx.roundRect(x + coverW / 2 - lblW / 2, cy, lblW, labelH - 2, 6);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "800 22px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(MONTHS[i].toUpperCase(), x + coverW / 2, cy + 8);

    if (winner) {
      drawCover(ctx, winner, x, cy + labelH, coverW, coverH);
    } else {
      ctx.save();
      ctx.fillStyle = "#ffffff11";
      ctx.beginPath();
      ctx.roundRect(x, cy + labelH, coverW, coverH, 8);
      ctx.fill();
      ctx.strokeStyle = "#ffffff22";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      ctx.fillStyle = "#ffffff33";
      ctx.font = "500 24px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("TBD", x + coverW / 2, cy + labelH + coverH / 2 + 8);
    }
  }

  drawCardFooter(ctx, W, H, itemCount, starCount);
  return new Promise(resolve => canvas.toBlob(resolve, "image/png"));
}

export async function generateTop3Card(data, year) {
  const W = 1080, H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  const CX = W / 2;
  const months = data.months;
  const b = data.bracket || {};
  const itemCount = months.reduce((n, m) => n + m.books.length, 0);
  const starCount = months.filter(m => m.winner).length;

  const r1Winners = R1.map(match => getR1Winner(match, months, b));
  const top3 = R2.map(match => {
    if (b[match.id]) return b[match.id];
    const w1 = r1Winners[R1.findIndex(r => r.id === match.p1)];
    const w2 = r1Winners[R1.findIndex(r => r.id === match.p2)];
    if (w1 && !w2) return w1;
    if (w2 && !w1) return w2;
    return null;
  }).filter(Boolean);

  const unique = [...new Map(top3.map(bk => [bk.id || bk.title, bk])).values()];
  await Promise.all(unique.map(async (bk) => { bk._coverImg = await loadImage(bk.cover); }));

  drawCardBg(ctx, W, H);
  let y = drawCardHeader(ctx, W, year);

  ctx.fillStyle = "#ffffffcc";
  ctx.font = "800 40px system-ui, sans-serif";
  ctx.letterSpacing = "6px";
  ctx.textAlign = "center";
  ctx.fillText("TOP 3", CX, y);
  ctx.letterSpacing = "0px";
  y += 64;

  if (top3.length > 0) {
    const footerStart = H - 110;
    const textBelow = 110;
    const maxCoverH = Math.min(520, footerStart - y - textBelow - 20);
    const maxCoverW = Math.floor(maxCoverH / 1.45);
    const maxPerCard = Math.floor((W - 100 - (top3.length - 1) * 24) / top3.length);
    const coverW = Math.min(maxCoverW, maxPerCard);
    const coverH = Math.floor(coverW * 1.45);
    const gap = Math.min(32, Math.floor((W - 100 - top3.length * coverW) / Math.max(top3.length - 1, 1)));
    const totalW = top3.length * coverW + Math.max(0, top3.length - 1) * gap;
    const startX = CX - totalW / 2;

    const ranks = ["\u{1F947}", "\u{1F948}", "\u{1F949}"];
    for (let i = 0; i < top3.length; i++) {
      const item = top3[i];
      const x = startX + i * (coverW + gap);

      ctx.font = "48px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(ranks[i] || "", x + coverW / 2, y - 2);

      drawCover(ctx, item, x, y + 14, coverW, coverH);

      ctx.font = "bold 26px system-ui, sans-serif";
      ctx.textAlign = "center";
      const titleLines = wrapText(ctx, item.title, coverW + 30);
      const displayLines = titleLines.slice(0, 2);
      if (titleLines.length > 2) displayLines[1] = displayLines[1].replace(/\s+\S*$/, "…");

      const tlH = displayLines.length * 32 + 14;
      ctx.fillStyle = "#00000055";
      ctx.beginPath();
      ctx.roundRect(x - 8, y + coverH + 22, coverW + 16, tlH, 8);
      ctx.fill();

      ctx.fillStyle = "#fff";
      displayLines.forEach((line, li) => {
        ctx.fillText(line, x + coverW / 2, y + coverH + 46 + li * 32);
      });

      if (item.author) {
        ctx.fillStyle = "#ffffffaa";
        ctx.font = "500 20px system-ui, sans-serif";
        ctx.fillText(item.author, x + coverW / 2, y + coverH + 46 + displayLines.length * 32 + 6);
      }
    }
  } else {
    ctx.fillStyle = "#ffffff44";
    ctx.font = "500 32px system-ui, sans-serif";
    ctx.fillText("Keep battling to reveal your Top 3!", CX, y + 60);
  }

  drawCardFooter(ctx, W, H, itemCount, starCount);
  return new Promise(resolve => canvas.toBlob(resolve, "image/png"));
}

export async function generateBOTYCard(data, year) {
  const W = 1080, H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  const CX = W / 2;
  const months = data.months;
  const b = data.bracket || {};
  const champion = b["final"];
  const itemCount = months.reduce((n, m) => n + m.books.length, 0);
  const starCount = months.filter(m => m.winner).length;

  if (champion) champion._coverImg = await loadImage(champion.cover);

  drawCardBg(ctx, W, H);
  let y = drawCardHeader(ctx, W, year);

  ctx.font = "80px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("\u{1F3C6}", CX, y + 20);
  y += 110;

  ctx.fillStyle = "#fbbf24";
  ctx.font = "800 44px system-ui, sans-serif";
  ctx.letterSpacing = "8px";
  ctx.fillText("BOOK OF THE YEAR", CX, y);
  ctx.letterSpacing = "0px";
  y += 64;

  if (champion) {
    const footerStart = H - 110;
    const textBelow = 130;
    const champH = Math.min(520, footerStart - y - textBelow);
    const champW = Math.floor(champH / 1.45);
    const coverX = CX - champW / 2;

    ctx.save();
    ctx.shadowColor = "#fbbf2444";
    ctx.shadowBlur = 40;
    drawCover(ctx, champion, coverX, y, champW, champH);
    ctx.restore();

    ctx.strokeStyle = "#fbbf24";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(coverX - 2, y - 2, champW + 4, champH + 4, 10);
    ctx.stroke();

    y += champH + 28;

    ctx.fillStyle = "#fff";
    ctx.font = "bold 42px system-ui, sans-serif";
    ctx.textAlign = "center";
    const titleLines = wrapText(ctx, champion.title, W - 160);
    titleLines.slice(0, 2).forEach((line, li) => {
      ctx.fillText(line, CX, y + li * 50);
    });
    y += Math.min(titleLines.length, 2) * 50;

    if (champion.author) {
      ctx.fillStyle = "#ffffffbb";
      ctx.font = "500 32px system-ui, sans-serif";
      ctx.fillText(champion.author, CX, y + 10);
    }
  } else {
    ctx.fillStyle = "#ffffff15";
    ctx.beginPath();
    ctx.roundRect(CX - 180, y, 360, 280, 20);
    ctx.fill();
    ctx.fillStyle = "#ffffff44";
    ctx.font = "500 30px system-ui, sans-serif";
    ctx.fillText("Complete the bracket", CX, y + 110);
    ctx.fillText("to crown your champion!", CX, y + 155);
    ctx.font = "64px system-ui, sans-serif";
    ctx.fillText("\u{1F451}", CX, y + 240);
  }

  drawCardFooter(ctx, W, H, itemCount, starCount);
  return new Promise(resolve => canvas.toBlob(resolve, "image/png"));
}
