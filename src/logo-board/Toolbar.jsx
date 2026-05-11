const TOOLS = [
  { id: "select", label: "Select",     hint: "V" },
  { id: "line",   label: "Line",       hint: "L" },
  { id: "arrow",  label: "Arrow",      hint: "A" },
  { id: "rect",   label: "Rectangle",  hint: "R" },
  { id: "text",   label: "Text",       hint: "T" },
];

export default function Toolbar({ tool, setTool, onDelete, hasSelection, onClear }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 4, padding: "8px 12px",
      background: "#0f172a", borderBottom: "1px solid #1e293b", color: "#e2e8f0",
    }}>
      {TOOLS.map(t => (
        <button
          key={t.id}
          onClick={() => setTool(t.id)}
          title={`${t.label} (${t.hint})`}
          style={{
            padding: "6px 12px", fontSize: 13, fontWeight: 600,
            background: tool === t.id ? "#6366f1" : "#1e293b",
            color: tool === t.id ? "#fff" : "#cbd5e1",
            border: "1px solid", borderColor: tool === t.id ? "#6366f1" : "#334155",
            borderRadius: 6, cursor: "pointer",
          }}
        >{t.label}</button>
      ))}

      <div style={{ width: 1, height: 24, background: "#1e293b", margin: "0 8px" }} />

      <button
        onClick={onDelete}
        disabled={!hasSelection}
        title="Delete selected (Del / Backspace)"
        style={{
          padding: "6px 12px", fontSize: 13, fontWeight: 600,
          background: "#1e293b", color: hasSelection ? "#f87171" : "#475569",
          border: "1px solid #334155", borderRadius: 6,
          cursor: hasSelection ? "pointer" : "not-allowed",
        }}
      >Delete</button>

      <div style={{ flex: 1 }} />

      <button
        onClick={onClear}
        title="Clear the entire board"
        style={{
          padding: "6px 12px", fontSize: 13, fontWeight: 600,
          background: "#1e293b", color: "#94a3b8",
          border: "1px solid #334155", borderRadius: 6, cursor: "pointer",
        }}
      >Clear board</button>
    </div>
  );
}
