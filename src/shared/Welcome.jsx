import { useState } from "react";

const STEPS = (cat) => [
  {
    icon: "📖",
    title: `Track your ${cat.plural}`,
    desc: `Add ${cat.plural} you ${cat.verb} to each month's shelf.`,
  },
  {
    icon: "⭐",
    title: "Pick monthly favorites",
    desc: `Star one ${cat.singular} per month — that pick enters the bracket.`,
  },
  {
    icon: "⚔️",
    title: "Battle them head-to-head",
    desc: "Monthly winners face off in a year-long tournament.",
  },
  {
    icon: "🏆",
    title: `Crown your ${cat.champion}`,
    desc: "Complete the bracket to find your #1 of the year.",
  },
];

export default function Welcome({ config, onDone }) {
  const [step, setStep] = useState(0);
  const steps = STEPS(config);
  const isLast = step === steps.length - 1;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "rgba(0,0,0,0.7)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "system-ui, -apple-system, sans-serif",
      padding: 20,
    }}>
      <div style={{
        background: "#fff", borderRadius: 24, maxWidth: 360, width: "100%",
        overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,0.3)",
      }}>
        {/* Hero header */}
        <div style={{
          background: "linear-gradient(135deg, #14532d, #166534)",
          padding: "32px 24px 28px", textAlign: "center", color: "#fff",
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🏆</div>
          <div style={{ fontWeight: 800, fontSize: 22, lineHeight: 1.3, marginBottom: 8 }}>
            {config.welcomeHeadline}
          </div>
          <div style={{ fontSize: 13, opacity: 0.8, lineHeight: 1.5 }}>
            {config.welcomeSub}
          </div>
        </div>

        {/* Steps carousel */}
        <div style={{ padding: "24px 24px 20px" }}>
          <div style={{
            display: "flex", alignItems: "flex-start", gap: 14,
            minHeight: 80,
          }}>
            <div style={{
              fontSize: 36, flexShrink: 0, width: 48, height: 48,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {steps[step].icon}
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: "#1c1917", marginBottom: 4 }}>
                {steps[step].title}
              </div>
              <div style={{ fontSize: 13, color: "#78716c", lineHeight: 1.5 }}>
                {steps[step].desc}
              </div>
            </div>
          </div>

          {/* Progress dots */}
          <div style={{ display: "flex", justifyContent: "center", gap: 6, margin: "20px 0 16px" }}>
            {steps.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                style={{
                  width: step === i ? 20 : 8, height: 8, borderRadius: 4,
                  background: step === i ? "#14532d" : "#e5e7eb",
                  border: "none", cursor: "pointer", padding: 0,
                  transition: "all 0.2s",
                }}
              />
            ))}
          </div>

          {/* CTA */}
          <button
            onClick={() => isLast ? onDone() : setStep(s => s + 1)}
            style={{
              width: "100%", padding: "14px 0", borderRadius: 14,
              background: "#14532d", color: "#fff", border: "none",
              fontWeight: 800, fontSize: 15, cursor: "pointer",
            }}
          >
            {isLast ? "Let's go!" : "Next"}
          </button>

          {!isLast && (
            <button
              onClick={onDone}
              style={{
                width: "100%", padding: "10px 0", marginTop: 6,
                background: "none", border: "none",
                color: "#9ca3af", fontSize: 12, cursor: "pointer",
              }}
            >
              Skip
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
