import { useEffect, useRef, useState } from "react";

/**
 * The board surface. Owns no state of its own beyond a few transient pointer
 * interactions (active drag, in-progress line/rect). Item state lives in the
 * parent so it can be persisted.
 */
export default function Canvas({
  items, selectedId, tool,
  onSelect, onUpdate, onCreate, setTool,
}) {
  const rootRef = useRef(null);

  // Transient drawing state for click-click line/arrow creation.
  const [pendingLine, setPendingLine] = useState(null); // { x1, y1, x2, y2 }
  // Transient state for click-drag rectangle creation.
  const [pendingRect, setPendingRect] = useState(null); // { x, y, w, h }

  // Convert a pointer event into canvas-local coordinates.
  const toLocal = (e) => {
    const rect = rootRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  // ─── Background interactions (depend on active tool) ──────────────────
  const onBackgroundPointerDown = (e) => {
    if (e.target !== rootRef.current && !e.target.dataset.background) return;
    const p = toLocal(e);

    if (tool === "select") {
      onSelect(null);
      return;
    }

    if (tool === "text") {
      onCreate({
        type: "text", text: "Text", x: p.x - 40, y: p.y - 12,
        w: 120, h: 28, rotation: 0, fontSize: 18, color: "#0f172a",
      });
      setTool("select");
      return;
    }

    if (tool === "rect") {
      setPendingRect({ x: p.x, y: p.y, w: 0, h: 0, startX: p.x, startY: p.y });
      return;
    }

    if (tool === "line" || tool === "arrow") {
      if (!pendingLine) {
        setPendingLine({ x1: p.x, y1: p.y, x2: p.x, y2: p.y });
      } else {
        onCreate({
          type: "line", x1: pendingLine.x1, y1: pendingLine.y1,
          x2: p.x, y2: p.y,
          stroke: "#0f172a", strokeWidth: 2, arrow: tool === "arrow",
        });
        setPendingLine(null);
        setTool("select");
      }
    }
  };

  // Background-level move: only used while building a rect or previewing a line.
  const onBackgroundPointerMove = (e) => {
    if (pendingRect) {
      const p = toLocal(e);
      setPendingRect(r => ({
        ...r,
        x: Math.min(r.startX, p.x),
        y: Math.min(r.startY, p.y),
        w: Math.abs(p.x - r.startX),
        h: Math.abs(p.y - r.startY),
      }));
    }
    if (pendingLine) {
      const p = toLocal(e);
      setPendingLine(l => ({ ...l, x2: p.x, y2: p.y }));
    }
  };

  const onBackgroundPointerUp = () => {
    if (pendingRect) {
      const { x, y, w, h } = pendingRect;
      const finalW = w < 8 ? 120 : w;
      const finalH = h < 8 ? 80 : h;
      onCreate({
        type: "rect", x, y, w: finalW, h: finalH, rotation: 0,
        stroke: "#0f172a", fill: "transparent", strokeWidth: 2,
      });
      setPendingRect(null);
      setTool("select");
    }
  };

  // Cancel an in-progress line on Escape.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        setPendingLine(null);
        setPendingRect(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ─── Drop handler for dragging images straight onto the canvas ────────
  const onDrop = (e) => {
    e.preventDefault();
    const p = toLocal(e);
    const url = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
    if (url && /^https?:|^data:/.test(url)) {
      onCreate({
        type: "image", src: url, x: p.x - 60, y: p.y - 60,
        w: 120, h: 120, rotation: 0,
      });
      return;
    }
    Array.from(e.dataTransfer.files || []).forEach(file => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () => onCreate({
        type: "image", src: reader.result, x: p.x - 60, y: p.y - 60,
        w: 120, h: 120, rotation: 0,
      });
      reader.readAsDataURL(file);
    });
  };

  const cursor =
    tool === "text" ? "text" :
    tool === "line" || tool === "arrow" ? "crosshair" :
    tool === "rect" ? "crosshair" : "default";

  // Render lines in a single overlaid SVG so they share coordinate space.
  const lines = items.filter(i => i.type === "line");
  const rects = items.filter(i => i.type === "rect");
  const others = items.filter(i => i.type === "image" || i.type === "text");

  return (
    <div
      ref={rootRef}
      data-background="true"
      onPointerDown={onBackgroundPointerDown}
      onPointerMove={onBackgroundPointerMove}
      onPointerUp={onBackgroundPointerUp}
      onDragOver={e => e.preventDefault()}
      onDrop={onDrop}
      style={{
        flex: 1, position: "relative", overflow: "hidden",
        background: "#f8fafc",
        backgroundImage: "radial-gradient(#cbd5e1 1px, transparent 1px)",
        backgroundSize: "24px 24px",
        cursor,
      }}
    >
      <svg
        data-background="true"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
      >
        <defs>
          <marker
            id="arrowhead" viewBox="0 0 10 10" refX="9" refY="5"
            markerWidth="7" markerHeight="7" orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#0f172a" />
          </marker>
        </defs>
        {rects.map(r => (
          <RectShape key={r.id} item={r} selected={selectedId === r.id}
            onSelect={() => onSelect(r.id)} onUpdate={p => onUpdate(r.id, p)}
            tool={tool} canvasRef={rootRef} />
        ))}
        {lines.map(l => (
          <LineShape key={l.id} item={l} selected={selectedId === l.id}
            onSelect={() => onSelect(l.id)} onUpdate={p => onUpdate(l.id, p)}
            tool={tool} canvasRef={rootRef} />
        ))}
        {pendingLine && (
          <line
            x1={pendingLine.x1} y1={pendingLine.y1}
            x2={pendingLine.x2} y2={pendingLine.y2}
            stroke="#6366f1" strokeWidth={2} strokeDasharray="4 4"
          />
        )}
        {pendingRect && (
          <rect
            x={pendingRect.x} y={pendingRect.y}
            width={pendingRect.w} height={pendingRect.h}
            stroke="#6366f1" fill="rgba(99,102,241,0.08)"
            strokeWidth={1.5} strokeDasharray="4 4"
          />
        )}
      </svg>

      {others.map(it => (
        <BoxItem
          key={it.id}
          item={it}
          selected={selectedId === it.id}
          tool={tool}
          canvasRef={rootRef}
          onSelect={() => onSelect(it.id)}
          onUpdate={patch => onUpdate(it.id, patch)}
        />
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Box-shaped items (image, text). Draggable, resizable, rotatable.
// ════════════════════════════════════════════════════════════════════════
function BoxItem({ item, selected, tool, canvasRef, onSelect, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const editRef = useRef(null);

  const startDrag = (e) => {
    if (tool !== "select") return;
    if (editing) return;
    e.stopPropagation();
    onSelect();
    const start = { x: e.clientX, y: e.clientY, ix: item.x, iy: item.y };
    const move = (ev) => onUpdate({
      x: start.ix + (ev.clientX - start.x),
      y: start.iy + (ev.clientY - start.y),
    });
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const startResize = (e) => {
    e.stopPropagation();
    const start = { x: e.clientX, y: e.clientY, w: item.w, h: item.h };
    const aspect = item.type === "image" ? item.w / item.h : null;
    const move = (ev) => {
      let w = Math.max(20, start.w + (ev.clientX - start.x));
      let h = Math.max(20, start.h + (ev.clientY - start.y));
      if (aspect) {
        // Keep aspect ratio for images — pick whichever delta is larger.
        const ratioByW = w / aspect;
        const ratioByH = h * aspect;
        if (Math.abs(w - start.w) > Math.abs(h - start.h)) h = ratioByW;
        else w = ratioByH;
      }
      onUpdate({ w, h });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const startRotate = (e) => {
    e.stopPropagation();
    const rect = canvasRef.current.getBoundingClientRect();
    const cx = rect.left + item.x + item.w / 2;
    const cy = rect.top  + item.y + item.h / 2;
    const move = (ev) => {
      const angle = Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI + 90;
      onUpdate({ rotation: Math.round(angle) });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // Commit text edits on blur.
  const finishEdit = () => {
    setEditing(false);
    if (editRef.current) onUpdate({ text: editRef.current.innerText });
  };

  return (
    <div
      onPointerDown={startDrag}
      onDoubleClick={() => {
        if (item.type === "text") {
          setEditing(true);
          setTimeout(() => {
            if (editRef.current) {
              editRef.current.focus();
              const range = document.createRange();
              range.selectNodeContents(editRef.current);
              const sel = window.getSelection();
              sel.removeAllRanges();
              sel.addRange(range);
            }
          }, 0);
        }
      }}
      style={{
        position: "absolute",
        left: item.x, top: item.y, width: item.w, height: item.h,
        transform: `rotate(${item.rotation || 0}deg)`,
        transformOrigin: "center center",
        outline: selected ? "2px solid #6366f1" : "none",
        outlineOffset: 2,
        cursor: tool === "select" ? (editing ? "text" : "move") : "default",
        userSelect: editing ? "text" : "none",
      }}
    >
      {item.type === "image" && (
        <img
          src={item.src} alt=""
          draggable={false}
          style={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }}
        />
      )}
      {item.type === "text" && (
        <div
          ref={editRef}
          contentEditable={editing}
          suppressContentEditableWarning
          onBlur={finishEdit}
          onKeyDown={e => { if (e.key === "Escape") finishEdit(); }}
          style={{
            width: "100%", height: "100%",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: item.fontSize || 18, color: item.color || "#0f172a",
            fontWeight: 600, textAlign: "center", padding: 4, boxSizing: "border-box",
            outline: editing ? "1px dashed #6366f1" : "none",
            background: editing ? "rgba(255,255,255,0.7)" : "transparent",
          }}
        >{item.text}</div>
      )}

      {selected && !editing && (
        <>
          <Handle position="br" onPointerDown={startResize} />
          <Handle position="rot" onPointerDown={startRotate} />
        </>
      )}
    </div>
  );
}

function Handle({ position, onPointerDown }) {
  const styles = {
    br:  { right: -6, bottom: -6, cursor: "nwse-resize" },
    rot: { left: "50%", top: -22, transform: "translateX(-50%)", cursor: "grab", borderRadius: "50%" },
  };
  return (
    <div
      onPointerDown={onPointerDown}
      style={{
        position: "absolute", width: 12, height: 12,
        background: "#6366f1", border: "2px solid #fff",
        boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
        ...styles[position],
      }}
    />
  );
}

// ════════════════════════════════════════════════════════════════════════
// Rectangle shape (SVG)
// ════════════════════════════════════════════════════════════════════════
function RectShape({ item, selected, onSelect, onUpdate, tool, canvasRef }) {
  const startDrag = (e) => {
    if (tool !== "select") return;
    e.stopPropagation();
    onSelect();
    const start = { x: e.clientX, y: e.clientY, ix: item.x, iy: item.y };
    const move = (ev) => onUpdate({
      x: start.ix + (ev.clientX - start.x),
      y: start.iy + (ev.clientY - start.y),
    });
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const startResize = (e) => {
    e.stopPropagation();
    const start = { x: e.clientX, y: e.clientY, w: item.w, h: item.h };
    const move = (ev) => onUpdate({
      w: Math.max(20, start.w + (ev.clientX - start.x)),
      h: Math.max(20, start.h + (ev.clientY - start.y)),
    });
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <g pointerEvents="all">
      <rect
        x={item.x} y={item.y} width={item.w} height={item.h}
        fill={item.fill || "transparent"}
        stroke={item.stroke || "#0f172a"}
        strokeWidth={item.strokeWidth || 2}
        onPointerDown={startDrag}
        style={{ cursor: tool === "select" ? "move" : "default" }}
      />
      {/* Invisible hit-area so clicking inside an unfilled rect still selects it. */}
      <rect
        x={item.x} y={item.y} width={item.w} height={item.h}
        fill="transparent" pointerEvents={item.fill === "transparent" ? "all" : "none"}
        onPointerDown={startDrag}
        style={{ cursor: tool === "select" ? "move" : "default" }}
      />
      {selected && (
        <rect
          x={item.x + item.w - 6} y={item.y + item.h - 6} width={12} height={12}
          fill="#6366f1" stroke="#fff" strokeWidth={2}
          style={{ cursor: "nwse-resize" }}
          onPointerDown={startResize}
        />
      )}
      {selected && (
        <rect
          x={item.x - 1} y={item.y - 1} width={item.w + 2} height={item.h + 2}
          fill="none" stroke="#6366f1" strokeWidth={1.5} strokeDasharray="3 3"
          pointerEvents="none"
        />
      )}
    </g>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Line / arrow shape (SVG). Endpoints draggable when selected.
// ════════════════════════════════════════════════════════════════════════
function LineShape({ item, selected, onSelect, onUpdate, tool, canvasRef }) {
  const dragEndpoint = (which) => (e) => {
    e.stopPropagation();
    const move = (ev) => {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      if (which === "a") onUpdate({ x1: x, y1: y });
      else onUpdate({ x2: x, y2: y });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const dragWhole = (e) => {
    if (tool !== "select") return;
    e.stopPropagation();
    onSelect();
    const start = {
      x: e.clientX, y: e.clientY,
      x1: item.x1, y1: item.y1, x2: item.x2, y2: item.y2,
    };
    const move = (ev) => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      onUpdate({
        x1: start.x1 + dx, y1: start.y1 + dy,
        x2: start.x2 + dx, y2: start.y2 + dy,
      });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <g pointerEvents="all">
      {/* Wide invisible hit area. */}
      <line
        x1={item.x1} y1={item.y1} x2={item.x2} y2={item.y2}
        stroke="transparent" strokeWidth={14}
        onPointerDown={dragWhole}
        style={{ cursor: tool === "select" ? "move" : "default" }}
      />
      <line
        x1={item.x1} y1={item.y1} x2={item.x2} y2={item.y2}
        stroke={item.stroke || "#0f172a"}
        strokeWidth={item.strokeWidth || 2}
        markerEnd={item.arrow ? "url(#arrowhead)" : undefined}
        pointerEvents="none"
      />
      {selected && (
        <>
          <circle cx={item.x1} cy={item.y1} r={6} fill="#6366f1" stroke="#fff" strokeWidth={2}
                  style={{ cursor: "grab" }} onPointerDown={dragEndpoint("a")} />
          <circle cx={item.x2} cy={item.y2} r={6} fill="#6366f1" stroke="#fff" strokeWidth={2}
                  style={{ cursor: "grab" }} onPointerDown={dragEndpoint("b")} />
        </>
      )}
    </g>
  );
}
