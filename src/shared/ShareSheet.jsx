/**
 * ShareSheet — bottom-sheet modal for sharing a winner card.
 *
 * Renders a live preview of the winner card in the user's chosen aspect
 * ratio (Square / Story / Wide), and offers two actions:
 *
 *   📤 Share    Web Share API with file payload — opens iOS/Android native
 *               share sheet so the user can post to IG/Twitter/iMessage in
 *               one tap.
 *   ⬇  Save     Falls back to a download link when Web Share is unavailable
 *               or the user explicitly wants the file.
 *
 * Props
 *   book         the champion item (title, author, cover)
 *   bracketName  display name for the bracket (e.g. "Best Sci-Fi 2025")
 *   subtitle     optional override for the "CHAMPION" sub-label
 *   onClose      () => void
 */

import { useEffect, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { renderWinnerCard, ASPECTS } from "./winnerCard.js";
import { playUI } from "./soundscape.js";

export default function ShareSheet({ book, bracketName, subtitle, onClose }) {
  const [aspect, setAspect] = useState("1:1");
  // Cache one blob URL per aspect — switching tabs is instant after first render
  const [urls, setUrls]     = useState({ "1:1": null, "9:16": null, "16:9": null });
  const [busy,  setBusy]    = useState(true);

  const filenameSlug = useMemo(() => {
    const slug = (bracketName || "champion").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return `${slug}-${aspect.replace(":", "x")}`;
  }, [bracketName, aspect]);

  // Pre-render all three aspects in parallel on mount.  Cleanup revokes
  // every blob URL on unmount so we don't leak memory.
  useEffect(() => {
    let cancelled = false;
    let createdUrls = [];
    (async () => {
      const blobs = await Promise.all(
        ASPECTS.map((a) => renderWinnerCard({ book, bracketName, subtitle, aspect: a.id })),
      );
      if (cancelled) {
        blobs.forEach((b) => b && URL.revokeObjectURL(URL.createObjectURL(b)));  // best-effort
        return;
      }
      const map = {};
      blobs.forEach((b, i) => {
        if (b) {
          const u = URL.createObjectURL(b);
          createdUrls.push(u);
          map[ASPECTS[i].id] = u;
        }
      });
      setUrls(map);
      setBusy(false);
    })();
    return () => {
      cancelled = true;
      createdUrls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [book?.title, book?.author, book?.cover, bracketName, subtitle]);

  const doShare = async () => {
    const url = urls[aspect];
    if (!url) return;
    playUI("commit");
    try {
      const res  = await fetch(url);
      const blob = await res.blob();
      const file = new File([blob], `${filenameSlug}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: bracketName || "The Bracket Club" });
        return;
      }
    } catch (e) {
      if (e?.name === "AbortError") return;
    }
    // Fallback: trigger a download
    doDownload();
  };

  const doDownload = () => {
    const url = urls[aspect];
    if (!url) return;
    playUI("commit");
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filenameSlug}.png`;
    a.click();
  };

  const overlay = (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1600,
        background: "rgba(0,0,0,0.78)", backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#0f3d1f", color: "#fff",
          borderRadius: "20px 20px 0 0",
          width: "100%", maxWidth: 520,
          padding: "16px 16px 24px",
          display: "flex", flexDirection: "column", gap: 14,
          boxShadow: "0 -8px 40px rgba(0,0,0,0.5)",
        }}
      >
        {/* Drag handle */}
        <div style={{ width: 40, height: 4, background: "rgba(255,255,255,0.25)", borderRadius: 2, alignSelf: "center" }} />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: "#fbbf24" }}>Share Now</div>
          <button onClick={onClose}
            style={{ background: "rgba(255,255,255,0.12)", border: "none", color: "#fff", borderRadius: 99, width: 30, height: 30, fontSize: 14, cursor: "pointer" }}>
            ✕
          </button>
        </div>

        {/* Aspect switcher */}
        <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
          {ASPECTS.map((a) => {
            const active = aspect === a.id;
            return (
              <button key={a.id}
                onClick={() => { playUI("tap"); setAspect(a.id); }}
                style={{
                  flex: 1, padding: "8px 6px",
                  background: active ? "#fbbf24" : "rgba(255,255,255,0.08)",
                  color:      active ? "#14532d" : "#fff",
                  border: "none", borderRadius: 10,
                  fontWeight: 800, fontSize: 12, cursor: "pointer",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                }}>
                <span>{a.label}</span>
                <span style={{ fontSize: 9, fontWeight: 600, opacity: 0.75 }}>{a.id}</span>
              </button>
            );
          })}
        </div>

        {/* Preview */}
        <div style={{
          background: "rgba(0,0,0,0.3)", borderRadius: 14, padding: 12,
          display: "flex", alignItems: "center", justifyContent: "center",
          minHeight: 280, maxHeight: 380, overflow: "hidden",
        }}>
          {busy || !urls[aspect] ? (
            <div style={{ color: "#fff8", fontSize: 12 }}>Generating preview…</div>
          ) : (
            <img
              src={urls[aspect]}
              alt="Winner card preview"
              style={{
                maxWidth: "100%", maxHeight: 360,
                borderRadius: 8,
                boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
                objectFit: "contain",
              }}
            />
          )}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={doDownload} disabled={busy || !urls[aspect]}
            style={{
              flex: 1, padding: "13px 14px",
              background: "rgba(255,255,255,0.12)", color: "#fff",
              border: "1px solid rgba(255,255,255,0.2)", borderRadius: 99,
              fontWeight: 800, fontSize: 14,
              cursor: busy ? "default" : "pointer", opacity: busy ? 0.5 : 1,
            }}>
            ⬇ Save
          </button>
          <button onClick={doShare} disabled={busy || !urls[aspect]}
            style={{
              flex: 1.4, padding: "13px 14px",
              background: "#fbbf24", color: "#14532d",
              border: "none", borderRadius: 99,
              fontWeight: 800, fontSize: 14,
              cursor: busy ? "default" : "pointer", opacity: busy ? 0.5 : 1,
              boxShadow: "0 4px 16px rgba(251,191,36,0.3)",
            }}>
            📤 Share
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
