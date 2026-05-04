/**
 * SwipeableRow — wraps a row (button, link, etc.) with iOS-style swipe-to-
 * action gestures.
 *
 *   • Drag left  past `threshold` → fires onSwipeLeft  (typically destructive)
 *   • Drag right past `threshold` → fires onSwipeRight (typically positive)
 *
 * As the user drags, the row translates and a coloured action band reveals
 * behind it.  Releasing past the threshold fires the action; releasing short
 * snaps back.  A small movement-tracker prevents the underlying click from
 * also firing when the user actually swiped.
 *
 * Designed to be safe to drop around any focusable child — onClick still
 * works for taps, swipes intercept click via onClickCapture only when the
 * touch moved meaningfully.
 *
 * Props
 *   leftLabel/leftIcon/leftBg     — action revealed when swiping LEFT (right side of row)
 *   rightLabel/rightIcon/rightBg  — action revealed when swiping RIGHT (left side)
 *   threshold                     — px of horizontal travel needed to commit (default 90)
 *   onSwipeLeft / onSwipeRight    — () => void
 */

import { useState, useRef } from "react";

const MAX_DRAG = 140;

export default function SwipeableRow({
  children,
  onSwipeLeft, onSwipeRight,
  leftLabel = "Delete", leftIcon = "🗑️", leftBg = "#dc2626",
  rightLabel = "Pin",    rightIcon = "📌", rightBg = "#f59e0b",
  threshold = 90,
  borderRadius = 16,
}) {
  const [dx, setDx] = useState(0);
  const startX  = useRef(null);
  const moved   = useRef(false);

  const onTouchStart = (e) => {
    startX.current = e.touches[0].clientX;
    moved.current  = false;
  };

  const onTouchMove = (e) => {
    if (startX.current == null) return;
    const delta = e.touches[0].clientX - startX.current;
    if (Math.abs(delta) > 10) moved.current = true;
    setDx(Math.max(-MAX_DRAG, Math.min(MAX_DRAG, delta)));
  };

  const onTouchEnd = (e) => {
    if (startX.current == null) return;
    const delta = e.changedTouches[0].clientX - startX.current;
    startX.current = null;
    setDx(0);
    if (delta <= -threshold && onSwipeLeft)  onSwipeLeft();
    else if (delta >=  threshold && onSwipeRight) onSwipeRight();
  };

  // Cancel the underlying click when the touch was actually a swipe.
  // Capture phase so we beat the child's own onClick handler.
  const onClickCapture = (e) => {
    if (moved.current) {
      e.stopPropagation();
      e.preventDefault();
      moved.current = false;
    }
  };

  // Reveal opacity scales with drag distance — feels alive
  const reveal = Math.min(1, Math.abs(dx) / threshold);

  const ActionBand = ({ side }) => {
    const showing = side === "right" ? dx > 0 : dx < 0;
    if (!showing) return null;
    const isRight = side === "right";
    return (
      <div style={{
        position: "absolute", top: 0, bottom: 0,
        [isRight ? "left" : "right"]: 0,
        width: Math.abs(dx),
        background: isRight ? rightBg : leftBg,
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: 6, padding: "0 14px", color: "#fff", fontWeight: 800, fontSize: 13,
        opacity: reveal,
        overflow: "hidden", whiteSpace: "nowrap",
      }}>
        <span style={{ fontSize: 18 }}>{isRight ? rightIcon : leftIcon}</span>
        {Math.abs(dx) > 70 && (isRight ? rightLabel : leftLabel)}
      </div>
    );
  };

  return (
    <div
      onClickCapture={onClickCapture}
      style={{ position: "relative", borderRadius, overflow: "hidden" }}
    >
      <ActionBand side="right" />
      <ActionBand side="left" />
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          transform: `translateX(${dx}px)`,
          transition: dx === 0 ? "transform 0.22s ease-out" : "none",
          position: "relative", zIndex: 1, touchAction: "pan-y",
        }}
      >
        {children}
      </div>
    </div>
  );
}
