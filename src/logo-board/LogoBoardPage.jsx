import { useEffect, useState } from "react";
import AddLogoPanel from "./AddLogoPanel.jsx";
import Toolbar from "./Toolbar.jsx";
import Canvas from "./Canvas.jsx";
import { load, save, newId } from "./storage.js";

export default function LogoBoardPage() {
  const [items, setItems] = useState(() => load()?.items || []);
  const [selectedId, setSelectedId] = useState(null);
  const [tool, setTool] = useState("select");

  // Persist to localStorage on every change. Cheap enough at this scale.
  useEffect(() => { save({ items }); }, [items]);

  const addItem = (partial) => {
    const id = newId();
    setItems(curr => [...curr, { id, ...partial }]);
    setSelectedId(id);
  };

  const updateItem = (id, patch) => {
    setItems(curr => curr.map(it => it.id === id ? { ...it, ...patch } : it));
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    setItems(curr => curr.filter(it => it.id !== selectedId));
    setSelectedId(null);
  };

  const clearBoard = () => {
    if (!items.length) return;
    if (!confirm("Clear the entire board?")) return;
    setItems([]);
    setSelectedId(null);
  };

  // Add a new image at a default canvas-center-ish location. The Add panel
  // doesn't know where the canvas is, so we just place it consistently.
  const addImage = (src) => {
    const x = 200 + Math.random() * 200;
    const y = 200 + Math.random() * 200;
    addItem({ type: "image", src, x, y, w: 120, h: 120, rotation: 0 });
  };

  // Keyboard shortcuts. Skip when typing in an input/contentEditable.
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target.tagName || "").toLowerCase();
      const isField = tag === "input" || tag === "textarea" || e.target.isContentEditable;
      if (isField) return;

      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        deleteSelected();
      }
      if (e.key === "v") setTool("select");
      if (e.key === "l") setTool("line");
      if (e.key === "a") setTool("arrow");
      if (e.key === "r") setTool("rect");
      if (e.key === "t") setTool("text");
      if (e.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId]);

  return (
    <div style={{
      position: "fixed", inset: 0, display: "flex", flexDirection: "column",
      background: "#0f172a", fontFamily: "system-ui, -apple-system, sans-serif",
    }}>
      <div style={{
        padding: "10px 16px", color: "#e2e8f0", fontSize: 14, fontWeight: 700,
        background: "#020617", borderBottom: "1px solid #1e293b",
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <span>Logo Board</span>
        <span style={{ fontSize: 12, color: "#64748b", fontWeight: 400 }}>
          Drag logos onto the canvas, draw lines, label them.
        </span>
      </div>
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <AddLogoPanel onAddImage={addImage} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <Toolbar
            tool={tool}
            setTool={setTool}
            onDelete={deleteSelected}
            hasSelection={!!selectedId}
            onClear={clearBoard}
          />
          <Canvas
            items={items}
            selectedId={selectedId}
            tool={tool}
            setTool={setTool}
            onSelect={setSelectedId}
            onUpdate={updateItem}
            onCreate={addItem}
          />
        </div>
      </div>
    </div>
  );
}
