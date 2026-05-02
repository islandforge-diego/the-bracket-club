import { MONTHS } from './constants.js';

export async function shareProgress(data, year, categoryLabel = "Books") {
  const lines = [`⚔️ The Bracket Club — ${categoryLabel} ${year}`, ""];
  const champion = data.bracket["final"];
  if (champion) {
    lines.push(`🏆 Best of ${year}: "${champion.title}"${champion.author ? ` by ${champion.author}` : ""}`, "");
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

export function fmtCount(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return Math.floor(n / 1000) + "K";
  return String(n);
}
