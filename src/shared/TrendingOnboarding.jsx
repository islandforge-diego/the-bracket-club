import { useState } from "react";
import { createPortal } from "react-dom";

const GRN = "#14532d";
const GRN_LT = "#f0fdf4";

// ─── Shared primitives ────────────────────────────────────────────────────────

function Overlay({ children }) {
  return createPortal(
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "rgba(0,0,0,0.65)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "system-ui, -apple-system, sans-serif", padding: 16,
    }}>
      <div style={{
        background: "#fff", borderRadius: 24, maxWidth: 420, width: "100%",
        maxHeight: "88vh", overflow: "hidden", display: "flex", flexDirection: "column",
        boxShadow: "0 24px 80px rgba(0,0,0,0.3)",
      }}>
        {children}
      </div>
    </div>,
    document.body
  );
}

function ProgressBar({ step, total }) {
  return (
    <div style={{ display: "flex", gap: 4, padding: "16px 20px 0", flexShrink: 0 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          height: 3, flex: i === step ? 2 : 1, borderRadius: 2,
          background: i <= step ? GRN : "#e5e7eb",
          transition: "all 0.35s",
        }} />
      ))}
    </div>
  );
}

function Chip({ label, selected, onToggle }) {
  return (
    <button
      onClick={onToggle}
      style={{
        padding: "7px 14px", borderRadius: 99,
        border: `1.5px solid ${selected ? GRN : "#e5e7eb"}`,
        background: selected ? GRN : "#fff",
        color: selected ? "#fff" : "#374151",
        fontSize: 13, fontWeight: selected ? 700 : 500,
        cursor: "pointer", transition: "all 0.15s",
        whiteSpace: "nowrap",
      }}
    >
      {selected ? "✓ " : ""}{label}
    </button>
  );
}

// ─── Main onboarding flow ─────────────────────────────────────────────────────

const STEPS = ["intro", "categories", "tags", "excluded", "discovery"];

export default function TrendingOnboarding({ config, editMode = false, initialPreferences, onComplete, onSkip }) {
  const [stepIdx, setStepIdx] = useState(editMode ? 1 : 0);
  const [draft, setDraft] = useState({
    selectedCategories: [],
    selectedTags: [],
    excludedTags: [],
    discoveryMode: "balanced",
    ...initialPreferences,
  });

  const tp = config.trendingPreferences;
  const step = STEPS[stepIdx];
  const totalQuestions = STEPS.length - 1;
  const questionIdx = stepIdx - 1;
  const isLast = stepIdx === STEPS.length - 1;

  const toggle = (field, id) => {
    setDraft(d => ({
      ...d,
      [field]: d[field].includes(id) ? d[field].filter(x => x !== id) : [...d[field], id],
    }));
  };

  const next = () => {
    if (!isLast) setStepIdx(s => s + 1);
    else onComplete({ personalizationEnabled: true, preferences: draft });
  };

  const stepConfig = {
    categories: { q: tp.categoryQuestion,    field: "selectedCategories", opts: tp.categoryOptions },
    tags:       { q: tp.tagQuestion,          field: "selectedTags",       opts: tp.tagOptions },
    excluded:   { q: tp.excludedTagQuestion,  field: "excludedTags",       opts: tp.excludedTagOptions },
    discovery:  { q: tp.discoveryQuestion,    opts: tp.discoveryOptions },
  };

  // ── Intro screen ──────────────────────────────────────────────────────────
  if (step === "intro") {
    return (
      <Overlay>
        <div style={{
          background: `linear-gradient(135deg, ${GRN}, #166534)`,
          padding: "36px 24px 28px", textAlign: "center", color: "#fff", flexShrink: 0,
        }}>
          <div style={{ fontSize: 48, marginBottom: 14 }}>🔥</div>
          <div style={{ fontWeight: 800, fontSize: 20, lineHeight: 1.35, marginBottom: 10 }}>
            Make Trending match your taste.
          </div>
          <div style={{ fontSize: 13, opacity: 0.85, lineHeight: 1.65 }}>
            Trending pulls popular {config.plural} from {config.source}. Answer a few quick
            questions to personalize results, or skip and see top trending overall.
          </div>
        </div>
        <div style={{ padding: "20px 20px 28px", display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            onClick={() => setStepIdx(1)}
            style={{
              padding: "15px 0", borderRadius: 14,
              background: GRN, color: "#fff", border: "none",
              fontWeight: 800, fontSize: 15, cursor: "pointer",
            }}
          >
            Personalize Trending →
          </button>
          <button
            onClick={onSkip}
            style={{
              padding: "11px 0", borderRadius: 14,
              background: "none", border: "none",
              color: "#9ca3af", fontSize: 13, cursor: "pointer",
            }}
          >
            Show top trending only
          </button>
        </div>
      </Overlay>
    );
  }

  // ── Question screens ──────────────────────────────────────────────────────
  const cur = stepConfig[step];
  const isDiscovery = step === "discovery";
  const isExcluded = step === "excluded";
  const hasSelection = isDiscovery
    ? !!draft.discoveryMode
    : draft[cur.field]?.length > 0;
  const canProceed = isExcluded || hasSelection;

  return (
    <Overlay>
      <ProgressBar step={questionIdx} total={totalQuestions} />

      {/* Header */}
      <div style={{ padding: "14px 20px 10px", flexShrink: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: "#9ca3af", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>
          Step {questionIdx + 1} of {totalQuestions}
        </div>
        <div style={{ fontWeight: 800, fontSize: 17, color: "#1c1917", lineHeight: 1.3 }}>
          {cur.q}
        </div>
        {isExcluded && (
          <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>
            Optional — skip if none apply
          </div>
        )}
      </div>

      {/* Options — scrollable */}
      <div style={{ padding: "0 20px 4px", overflowY: "auto", flex: 1 }}>
        {isDiscovery ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingBottom: 8 }}>
            {cur.opts.map(opt => {
              const sel = draft.discoveryMode === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => setDraft(d => ({ ...d, discoveryMode: opt.id }))}
                  style={{
                    border: `2px solid ${sel ? GRN : "#e5e7eb"}`,
                    borderRadius: 14, padding: "14px 16px",
                    background: sel ? GRN_LT : "#fff",
                    textAlign: "left", cursor: "pointer", transition: "all 0.15s",
                  }}
                >
                  <div style={{ fontWeight: 800, fontSize: 14, color: sel ? GRN : "#1c1917", marginBottom: 3 }}>
                    {sel ? "✓ " : ""}{opt.label}
                  </div>
                  <div style={{ fontSize: 12, color: "#78716c" }}>{opt.description}</div>
                </button>
              );
            })}
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, paddingBottom: 8 }}>
            {cur.opts.map(opt => (
              <Chip
                key={opt.id}
                label={opt.label}
                selected={draft[cur.field].includes(opt.id)}
                onToggle={() => toggle(cur.field, opt.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ padding: "12px 20px 20px", display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
        <button
          onClick={next}
          disabled={!canProceed}
          style={{
            padding: "14px 0", borderRadius: 14,
            background: canProceed ? GRN : "#e5e7eb",
            color: canProceed ? "#fff" : "#9ca3af",
            border: "none", fontWeight: 800, fontSize: 15,
            cursor: canProceed ? "pointer" : "default",
            transition: "all 0.2s",
          }}
        >
          {isLast ? "Finish setup ✓" : "Next →"}
        </button>
        {isExcluded && (
          <button
            onClick={() => setStepIdx(s => s + 1)}
            style={{
              padding: "10px 0", background: "none", border: "none",
              color: "#9ca3af", fontSize: 13, cursor: "pointer",
            }}
          >
            Skip this step →
          </button>
        )}
      </div>
    </Overlay>
  );
}

// ─── Post-onboarding banner ───────────────────────────────────────────────────

export function TrendingBanner({ prefs, onPersonalize, onOpenControls }) {
  const personalized = prefs.personalizationEnabled;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      background: personalized ? GRN_LT : "#f9fafb",
      borderRadius: 10, padding: "8px 12px", flexShrink: 0,
    }}>
      <span style={{ fontSize: 14 }}>{personalized ? "🎯" : "📈"}</span>
      <div style={{ flex: 1, fontSize: 12, color: personalized ? "#166534" : "#6b7280", fontWeight: 600 }}>
        {personalized
          ? "Trending is personalized based on your taste"
          : "Showing top trending overall"}
      </div>
      {!personalized && (
        <button
          onClick={onPersonalize}
          style={{
            fontSize: 11, fontWeight: 800, color: GRN,
            background: "none", border: "none", cursor: "pointer", padding: 0,
          }}
        >
          Personalize
        </button>
      )}
      <button
        onClick={onOpenControls}
        style={{
          fontSize: 16, color: "#9ca3af",
          background: "none", border: "none", cursor: "pointer", padding: "0 2px",
          lineHeight: 1,
        }}
        aria-label="Trending settings"
      >
        ⚙
      </button>
    </div>
  );
}

// ─── Controls sheet ───────────────────────────────────────────────────────────

export function TrendingControlsSheet({ prefs, onEdit, onReset, onRefresh, onClose }) {
  const personalized = prefs.personalizationEnabled;
  const lastRefresh = prefs.resultsLastRefreshedAt
    ? new Date(prefs.resultsLastRefreshedAt).toLocaleDateString()
    : null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 199, background: "rgba(0,0,0,0.3)" }}
      />
      {/* Sheet */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 200,
        background: "#fff", borderRadius: "20px 20px 0 0",
        padding: "20px 20px 36px",
        fontFamily: "system-ui, -apple-system, sans-serif",
        boxShadow: "0 -8px 40px rgba(0,0,0,0.18)",
      }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: "#e5e7eb", margin: "0 auto 20px" }} />
        <div style={{ fontWeight: 800, fontSize: 15, color: "#1c1917", marginBottom: 16 }}>
          Trending settings
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {personalized && (
            <SheetRow
              icon="✏️"
              label="Edit preferences"
              description="Update your genre and mood picks"
              onClick={onEdit}
            />
          )}
          {!personalized && (
            <SheetRow
              icon="🎯"
              label="Personalize Trending"
              description="Answer a few questions to filter results"
              onClick={onEdit}
            />
          )}
          <SheetRow
            icon="↺"
            label="Refresh trending results"
            description={lastRefresh ? `Last refreshed ${lastRefresh}` : "Clear cached results and re-fetch"}
            onClick={onRefresh}
          />
          <SheetRow
            icon="🗑"
            label="Reset preferences"
            description="Clear all your preference answers"
            destructive
            onClick={onReset}
          />
        </div>
      </div>
    </>,
    document.body
  );
}

function SheetRow({ icon, label, description, onClick, destructive }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 14,
        padding: "12px 4px", background: "none", border: "none",
        borderBottom: "1px solid #f5f5f4", textAlign: "left", cursor: "pointer",
        width: "100%",
      }}
    >
      <span style={{ fontSize: 20, width: 28, textAlign: "center", flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: destructive ? "#dc2626" : "#1c1917", marginBottom: 2 }}>
          {label}
        </div>
        <div style={{ fontSize: 12, color: "#9ca3af" }}>{description}</div>
      </div>
      <span style={{ color: "#d1d5db", fontSize: 14 }}>›</span>
    </button>
  );
}
