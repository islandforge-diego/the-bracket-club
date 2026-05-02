import { useState, useEffect } from "react";

function getSteps(cat) {
  return [
    {
      target: "home-grid",
      tab: "home",
      emoji: "📅",
      title: "Your reading year",
      body: `Tap any month to add ${cat.plural} you ${cat.pastVerb}. Star your favourite each month to enter it into the bracket.`,
    },
    {
      target: "import-btn",
      tab: "home",
      emoji: "📥",
      title: "Import from Goodreads",
      body: `Already tracking on Goodreads? Tap Import to pull in all your reads automatically — no manual entry needed.`,
    },
    {
      target: "year-nav",
      tab: "home",
      emoji: "📆",
      title: "Browse any year",
      body: `Use the arrows to switch between years. Each year gets its own shelf and its own bracket.`,
    },
    {
      target: "trending-grid",
      tab: "popular",
      emoji: "🔥",
      title: "The Trending tab",
      body: `Popular ${cat.plural} from ${cat.source} — not your personal reads. Pick monthly favourites here to build a separate Trending bracket.`,
    },
    {
      target: "bracket-hub",
      tab: "bracket",
      emoji: "🏆",
      title: "The Bracket tab",
      body: `Your tournament lives here. My Shelf battles your personal picks. Popular Releases battles trending ${cat.plural}. Complete either to crown a champion.`,
    },
  ];
}

export default function Tour({ config, setView, onDone }) {
  const steps = getSteps(config);
  const [stepIdx, setStepIdx] = useState(0);
  const [rect, setRect] = useState(null);
  const step = steps[stepIdx];

  // Switch tab when step requires it
  useEffect(() => {
    if (step.tab) setView(step.tab);
  }, [stepIdx]);

  // Measure target element, with retries for tab transition delay
  useEffect(() => {
    setRect(null);
    let alive = true;
    const measure = () => {
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      if (el && alive) {
        const r = el.getBoundingClientRect();
        // Only accept if element is in viewport (not offscreen in slider)
        if (r.width > 0 && r.left >= 0 && r.left < window.innerWidth) {
          setRect(r);
          return true;
        }
      }
      return false;
    };
    // Try immediately, then retry after transition
    if (!measure()) {
      const t1 = setTimeout(() => { if (!measure()) setTimeout(measure, 300); }, 100);
      return () => { alive = false; clearTimeout(t1); };
    }
    return () => { alive = false; };
  }, [stepIdx, step.target]);

  // Re-measure on resize
  useEffect(() => {
    const onResize = () => {
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      if (el) setRect(el.getBoundingClientRect());
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [step.target]);

  const advance = () => {
    if (stepIdx < steps.length - 1) setStepIdx(s => s + 1);
    else onDone();
  };

  const PAD = 10;
  const screenH = window.innerHeight;

  const spotLeft = rect ? Math.max(0, rect.left - PAD) : 0;
  const spotTop  = rect ? Math.max(0, rect.top  - PAD) : 0;
  const spotW    = rect ? rect.width  + PAD * 2 : 0;
  const spotH    = rect ? rect.height + PAD * 2 : 0;

  // Tooltip goes below if the element's centre is in the top 55% of screen
  const showBelow = rect ? (rect.top + rect.height / 2) < screenH * 0.55 : true;
  const TOOLTIP_GAP = 16;

  return (
    <>
      {/* ── Dark overlay with spotlight cutout ── */}
      <svg
        style={{ position: "fixed", inset: 0, width: "100%", height: "100%", zIndex: 500, pointerEvents: "all" }}
        onClick={e => e.stopPropagation()}
      >
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {rect && (
              <rect x={spotLeft} y={spotTop} width={spotW} height={spotH} rx={14} fill="black" />
            )}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.72)" mask="url(#tour-mask)" />
      </svg>

      {/* ── Glowing click zone over the spotlight ── */}
      {rect && (
        <div
          onClick={advance}
          style={{
            position: "fixed",
            left: spotLeft, top: spotTop,
            width: spotW, height: spotH,
            zIndex: 502,
            borderRadius: 14,
            cursor: "pointer",
            boxShadow: "0 0 0 3px #22c55e, 0 0 0 9px rgba(34,197,94,0.22)",
            animation: "tour-pulse 2s infinite",
          }}
        />
      )}

      {/* ── Tooltip ── */}
      <div
        style={{
          position: "fixed",
          left: 16, right: 16,
          ...(showBelow
            ? { top: rect ? spotTop + spotH + TOOLTIP_GAP : screenH - 220 }
            : { bottom: rect ? screenH - spotTop + TOOLTIP_GAP : 40 }),
          zIndex: 503,
          background: "#fff",
          borderRadius: 20,
          padding: "18px 18px 16px",
          boxShadow: "0 16px 56px rgba(0,0,0,0.28)",
          fontFamily: "system-ui, -apple-system, sans-serif",
          transition: "top 0.3s, bottom 0.3s",
        }}
      >
        {/* Progress bar */}
        <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
          {steps.map((_, i) => (
            <div
              key={i}
              style={{
                height: 4, flex: i === stepIdx ? 2 : 1,
                borderRadius: 2,
                background: i <= stepIdx ? "#14532d" : "#e5e7eb",
                transition: "all 0.35s",
              }}
            />
          ))}
        </div>

        {/* Content */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
          <span style={{ fontSize: 28, lineHeight: 1, flexShrink: 0 }}>{step.emoji}</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, color: "#1c1917", marginBottom: 5 }}>
              {step.title}
            </div>
            <div style={{ fontSize: 13, color: "#57534e", lineHeight: 1.6 }}>
              {step.body}
            </div>
          </div>
        </div>

        {/* Tap hint */}
        {rect && (
          <div style={{ fontSize: 11, color: "#a8a29e", marginBottom: 12, display: "flex", alignItems: "center", gap: 4 }}>
            <span>👆</span>
            <span>Tap the highlighted area to continue</span>
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onDone}
            style={{
              flex: 1, padding: "11px 0", borderRadius: 12,
              background: "#f5f5f4", border: "none",
              color: "#78716c", fontSize: 12, fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Skip tour
          </button>
          <button
            onClick={advance}
            style={{
              flex: 2, padding: "11px 0", borderRadius: 12,
              background: "#14532d", border: "none",
              color: "#fff", fontSize: 13, fontWeight: 800,
              cursor: "pointer",
            }}
          >
            {stepIdx < steps.length - 1 ? "Next →" : "Let's go! 🎉"}
          </button>
        </div>
      </div>

      {/* Pulse animation */}
      <style>{`
        @keyframes tour-pulse {
          0%, 100% { box-shadow: 0 0 0 3px #22c55e, 0 0 0 9px rgba(34,197,94,0.22); }
          50%       { box-shadow: 0 0 0 3px #22c55e, 0 0 0 14px rgba(34,197,94,0.08); }
        }
      `}</style>
    </>
  );
}
