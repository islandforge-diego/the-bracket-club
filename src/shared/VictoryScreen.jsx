/**
 * VictoryScreen — full-screen overlay celebrating a bracket champion.
 *
 * Shown when:
 *   - The annual bracket's `final` is set (year champion crowned)
 *   - A monthly bracket's last round resolves (month champion crowned)
 *
 * Pure CSS confetti — no extra dependency.  Auto-runs once on mount, then
 * the user dismisses (or shares) to close.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Cover from "./Cover.jsx";

const CONFETTI_COLORS = ["#fbbf24", "#22c55e", "#3b82f6", "#ec4899", "#a855f7", "#ef4444", "#06b6d4"];
const CONFETTI_COUNT  = 80;

/**
 * Synthesize a short victory chime via the Web Audio API.
 *
 * Plays a C-major arpeggio (C5 → E5 → G5 → C6) with a triangle-wave timbre
 * and a quick attack / slow release envelope so it sounds like a celebratory
 * harp pluck.  No external audio assets needed.
 *
 * Wrapped in try/catch by callers — older browsers or autoplay-blocked
 * contexts silently no-op.
 */
function playVictoryChime() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  const ctx = new AC();

  // C major → 4 ascending notes (Hz).  Slight overlap so they ring together.
  const notes = [
    { freq: 523.25, when: 0.00, dur: 0.40 },   // C5
    { freq: 659.25, when: 0.10, dur: 0.40 },   // E5
    { freq: 783.99, when: 0.20, dur: 0.40 },   // G5
    { freq: 1046.5, when: 0.30, dur: 0.80 },   // C6 — held longer for triumph
  ];

  const master = ctx.createGain();
  master.gain.value = 0.18;                    // overall volume — gentle, not jarring
  master.connect(ctx.destination);

  const t0 = ctx.currentTime;
  for (const n of notes) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = n.freq;
    // ADSR-ish: instant attack, slow release
    env.gain.setValueAtTime(0.0001, t0 + n.when);
    env.gain.exponentialRampToValueAtTime(1.0, t0 + n.when + 0.02);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + n.when + n.dur);
    osc.connect(env);
    env.connect(master);
    osc.start(t0 + n.when);
    osc.stop(t0 + n.when + n.dur + 0.02);
  }

  // Auto-close the context after the longest note finishes so we don't leak
  // audio resources across many crownings in a session.
  setTimeout(() => ctx.close().catch(() => {}), 1500);
}

export default function VictoryScreen({ book, title = "Champion", subtitle, onClose, onShare }) {
  const [entering, setEntering] = useState(true);
  const audioFired = useRef(false);

  // Mount animation: scale-in cover + trophy from 0 → 1
  useEffect(() => {
    const t = setTimeout(() => setEntering(false), 50);
    if (!audioFired.current) {
      // Tiny haptic buzz on supported devices
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate([15, 60, 25]);
      }
      // Synth victory chime — no asset needed, generated via Web Audio API.
      // Safe to ignore if the browser blocks audio (autoplay policy without
      // user gesture).  The crowning *is* a user gesture (a click), so this
      // runs reliably on every modern browser.
      try { playVictoryChime(); } catch { /* ignore audio failures */ }
      audioFired.current = true;
    }
    return () => clearTimeout(t);
  }, []);

  // Pre-compute confetti pieces once so re-renders don't reshuffle them.
  const confetti = useRef(
    Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
      left:        Math.random() * 100,                  // start x %
      delay:       Math.random() * 800,                  // ms
      duration:    2400 + Math.random() * 1800,          // ms
      drift:       (Math.random() - 0.5) * 200,          // horizontal drift px
      rotate:      Math.random() * 720 - 360,            // rotation degrees
      size:        6 + Math.random() * 8,                // px
      color:       CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      shape:       i % 4 === 0 ? "circle" : "square",
    })),
  ).current;

  const overlay = (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1500,
        background: "linear-gradient(160deg, rgba(20,83,45,0.96), rgba(13,44,25,0.98))",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        overflow: "hidden", padding: "24px",
      }}
      onClick={onClose}
    >
      {/* ── Confetti layer ───────────────────────────────────────────────── */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
        {confetti.map((c, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              top: -20,
              left: `${c.left}%`,
              width: c.size,
              height: c.size,
              background: c.color,
              borderRadius: c.shape === "circle" ? "50%" : 2,
              opacity: 0.9,
              animation: `bc-confetti-fall ${c.duration}ms ${c.delay}ms cubic-bezier(.2,.7,.4,1) forwards`,
              transform: `translateX(${c.drift}px) rotate(${c.rotate}deg)`,
              "--bc-confetti-drift": `${c.drift}px`,
              "--bc-confetti-rotate": `${c.rotate}deg`,
            }}
          />
        ))}
      </div>

      <style>{`
        @keyframes bc-confetti-fall {
          0%   { top: -20px;  opacity: 0; transform: translateX(0) rotate(0deg); }
          10%  { opacity: 1; }
          100% { top: 110vh; opacity: 1; transform: translateX(var(--bc-confetti-drift)) rotate(var(--bc-confetti-rotate)); }
        }
        @keyframes bc-trophy-pop {
          0%   { transform: scale(0)   rotate(-12deg); opacity: 0; }
          60%  { transform: scale(1.2) rotate(8deg);   opacity: 1; }
          100% { transform: scale(1)   rotate(0deg);   opacity: 1; }
        }
        @keyframes bc-cover-rise {
          0%   { transform: scale(0.4) translateY(40px); opacity: 0; }
          100% { transform: scale(1)   translateY(0);    opacity: 1; }
        }
        @keyframes bc-text-fade {
          0%   { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes bc-glow-pulse {
          0%, 100% { box-shadow: 0 8px 40px rgba(251,191,36,0.4), 0 0 80px rgba(251,191,36,0.25); }
          50%      { box-shadow: 0 8px 40px rgba(251,191,36,0.7), 0 0 120px rgba(251,191,36,0.45); }
        }
      `}</style>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          display: "flex", flexDirection: "column", alignItems: "center", gap: 18,
          textAlign: "center", color: "#fff", maxWidth: 360, position: "relative", zIndex: 1,
        }}
      >
        <div style={{ fontSize: 64, animation: "bc-trophy-pop 700ms cubic-bezier(.34,1.56,.64,1) forwards" }}>
          🏆
        </div>

        <div style={{ animation: "bc-text-fade 600ms 200ms backwards" }}>
          <div style={{ fontSize: 18, color: "#fbbf24", textTransform: "uppercase", letterSpacing: 4, fontWeight: 900, lineHeight: 1.15 }}>
            {title}
          </div>
        </div>

        {book && (
          <div
            style={{
              borderRadius: 12,
              animation: "bc-cover-rise 700ms 300ms cubic-bezier(.34,1.56,.64,1) backwards, bc-glow-pulse 2.4s 1s ease-in-out infinite",
              padding: 4, background: "rgba(251,191,36,0.15)",
            }}
          >
            <Cover book={book} size="xl" />
          </div>
        )}

        <div style={{ animation: "bc-text-fade 600ms 600ms backwards" }}>
          <div style={{ fontWeight: 800, fontSize: 22, lineHeight: 1.2 }}>
            {book?.title || "Champion"}
          </div>
          {book?.author && (
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>
              {book.author}
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex", gap: 10, marginTop: 12, width: "100%",
            justifyContent: onShare ? "stretch" : "center",
            animation: "bc-text-fade 600ms 900ms backwards",
          }}
        >
          {onShare && (
            <button
              onClick={onShare}
              style={{
                flex: 1, background: "#fbbf24", color: "#14532d", border: "none",
                borderRadius: 99, padding: "12px 20px", fontWeight: 800, fontSize: 14, cursor: "pointer",
                boxShadow: "0 4px 16px rgba(251,191,36,0.3)",
              }}
            >
              📤 Share
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              flex: onShare ? 1 : "none",
              minWidth: onShare ? undefined : 160,                  // wider tap target when alone
              padding: "12px 20px",
              background: "rgba(255,255,255,0.15)", color: "#fff", border: "1px solid rgba(255,255,255,0.25)",
              borderRadius: 99, fontWeight: 700, fontSize: 14, cursor: "pointer",
            }}
          >
            {onShare ? "Done" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
