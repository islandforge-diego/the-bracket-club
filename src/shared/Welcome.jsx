export default function Welcome({ config, onStartTour, onSkip }) {
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
        <div style={{
          background: "linear-gradient(135deg, #14532d, #166534)",
          padding: "40px 28px 36px", textAlign: "center", color: "#fff",
        }}>
          <div style={{ fontSize: 56, marginBottom: 18 }}>🏆</div>
          <div style={{ fontWeight: 800, fontSize: 22, lineHeight: 1.35, marginBottom: 12 }}>
            {config.welcomeHeadline}
          </div>
          <div style={{ fontSize: 14, opacity: 0.82, lineHeight: 1.6 }}>
            {config.welcomeSub}
          </div>
        </div>

        <div style={{ padding: "24px 20px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            onClick={onStartTour}
            style={{
              padding: "15px 0", borderRadius: 14,
              background: "#14532d", color: "#fff", border: "none",
              fontWeight: 800, fontSize: 15, cursor: "pointer",
            }}
          >
            Show me around →
          </button>
          <button
            onClick={onSkip}
            style={{
              padding: "11px 0", borderRadius: 14,
              background: "none", border: "none",
              color: "#9ca3af", fontSize: 13, cursor: "pointer",
            }}
          >
            Skip, I'll explore on my own
          </button>
        </div>
      </div>
    </div>
  );
}
