import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Cover from "./Cover.jsx";

function fmtNum(n) {
  if (!n) return null;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`;
  return String(n);
}

function Stars({ value, max = 5 }) {
  const filled = Math.round(value);
  return (
    <span style={{ color: "#f59e0b", letterSpacing: 1, fontSize: 13 }}>
      {"★".repeat(filled)}{"☆".repeat(Math.max(0, max - filled))}
    </span>
  );
}

function Pill({ children, color = "#f9fafb", text = "#6b7280" }) {
  return (
    <span style={{
      background: color, color: text,
      borderRadius: 8, padding: "3px 9px",
      fontSize: 12, fontWeight: 600,
      whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}

export default function BookDetailSheet({ book, onClose }) {
  const [desc, setDesc] = useState(book.description || null);
  const [descLoading, setDescLoading] = useState(!book.description);

  useEffect(() => {
    if (book.description) return;
    setDescLoading(true);
    const q = [book.title, book.author].filter(Boolean).join(" ");
    fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&fields=title,first_sentence&limit=1`)
      .then(r => r.json())
      .then(data => {
        const raw = data.docs?.[0]?.first_sentence;
        const text = raw ? (typeof raw === "object" ? raw.value : raw) : "";
        setDesc(text || "");
      })
      .catch(() => setDesc(""))
      .finally(() => setDescLoading(false));
  }, [book.title, book.author]);

  const avgRating = book.avgRating ?? null;
  const userRating = book.rating ?? null;
  const pop = fmtNum(book.popularity);
  const rCount = fmtNum(book.ratingsCount);

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.45)" }}
      />

      {/* Sheet */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 401,
        background: "#fff", borderRadius: "24px 24px 0 0",
        maxHeight: "82vh", display: "flex", flexDirection: "column",
        boxShadow: "0 -8px 48px rgba(0,0,0,0.22)",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}>
        {/* Drag handle + close */}
        <div style={{ display: "flex", alignItems: "center", padding: "12px 16px 0" }}>
          <div style={{ flex: 1 }} />
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "#e5e7eb" }} />
          <div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={onClose}
              style={{
                background: "#f5f5f4", border: "none", borderRadius: 99,
                width: 28, height: 28, fontSize: 14, color: "#78716c",
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >✕</button>
          </div>
        </div>

        {/* Scrollable content */}
        <div style={{ overflowY: "auto", padding: "16px 20px 40px" }}>
          {/* Header: cover + meta */}
          <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
            <div style={{ flexShrink: 0 }}>
              <Cover book={book} size="lg" />
            </div>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: "#1c1917", lineHeight: 1.3 }}>
                {book.title}
              </div>
              {book.author && (
                <div style={{ fontSize: 13, color: "#78716c" }}>{book.author}</div>
              )}

              {/* Rating row */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
                {avgRating != null && (
                  <div style={{ display: "flex", alignItems: "center", gap: 5, background: "#fefce8", borderRadius: 8, padding: "4px 8px" }}>
                    <Stars value={avgRating} />
                    <span style={{ fontSize: 12, fontWeight: 800, color: "#b45309" }}>
                      {avgRating.toFixed(1)}
                    </span>
                  </div>
                )}
                {userRating != null && avgRating == null && (
                  <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#fefce8", borderRadius: 8, padding: "4px 8px" }}>
                    <Stars value={userRating} />
                    <span style={{ fontSize: 11, color: "#b45309" }}>your rating</span>
                  </div>
                )}
                {rCount && <Pill>{rCount} ratings</Pill>}
                {pop && <Pill>{pop} added</Pill>}
              </div>
            </div>
          </div>

          {/* Description */}
          <div style={{ borderTop: "1px solid #f5f5f4", paddingTop: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
              About this book
            </div>
            {descLoading ? (
              <div style={{ fontSize: 13, color: "#d1d5db", fontStyle: "italic" }}>
                Loading…
              </div>
            ) : desc ? (
              <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.75 }}>
                {desc}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: "#d1d5db", fontStyle: "italic" }}>
                No description available
              </div>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
