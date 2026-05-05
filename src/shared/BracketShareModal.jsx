/**
 * BracketShareModal — author-side modal for inviting friends to vote.
 *
 * Mobile-first flow:
 *   1. Modal opens → share_code generated immediately → URL auto-copied
 *      to the clipboard so the author can paste anywhere right away.
 *   2. Hero "📤 Share Link" button at the very top opens the native share
 *      sheet (iOS/Android) for one-tap posting to iMessage/Twitter/etc.
 *   3. Settings (toggles + deadline) sit below — most users won't touch
 *      them but they're there.
 *
 * On generation failure (network blip, RLS edge case) we surface the error
 * with a Retry button instead of silently hiding the link section.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  shareBracket,
  revokeShare,
  updateShareSettings,
  countParticipations,
} from "../lib/multiplayerSync.js";
import { syncNow } from "./cloudSync.js";
import { playUI } from "./soundscape.js";

const REFRESH_MS = 6000;

export default function BracketShareModal({ bracket, onUpdated, onClose }) {
  const [working, setWorking] = useState(!bracket.share_code);
  const [shared,  setShared]  = useState(bracket);
  const [count,   setCount]   = useState(0);
  const [toast,   setToast]   = useState("");          // transient confirmation
  const [error,   setError]   = useState("");
  const [retryNonce, setRetryNonce] = useState(0);

  const shareUrl = shared.share_code
    ? `${window.location.origin}/b/${shared.share_code}`
    : null;

  // ── Generate (or refresh) the share link ──────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (shared.share_code) { setWorking(false); return; }
      setWorking(true);
      setError("");
      try {
        // Force-flush any pending cloud sync push so the bracket exists
        // on the server before we try to add share_code.  shareBracket
        // also has an upsert fallback as belt-and-suspenders.
        await syncNow().catch(() => { /* sync errors don't block */ });
        const updated = await shareBracket(shared);
        if (cancelled) return;
        setShared(updated);
        onUpdated?.(updated);
        // Auto-copy as soon as the link is ready — saves a tap.
        const url = `${window.location.origin}/b/${updated.share_code}`;
        try {
          await navigator.clipboard.writeText(url);
          flashToast("✓ Link copied to clipboard");
        } catch { /* clipboard permission denied — that's fine */ }
      } catch (e) {
        if (!cancelled) setError(e?.message || "Couldn't generate link");
      } finally {
        if (!cancelled) setWorking(false);
      }
    })();
    return () => { cancelled = true; };
  }, [retryNonce]);

  // ── Live participants count ───────────────────────────────────────
  useEffect(() => {
    if (!shared.share_code) return;
    let cancelled = false;
    const tick = async () => {
      const n = await countParticipations(shared.id);
      if (!cancelled) setCount(n);
    };
    tick();
    const t = setInterval(tick, REFRESH_MS);
    return () => { cancelled = true; clearInterval(t); };
  }, [shared.share_code, shared.id]);

  // ── Helpers ───────────────────────────────────────────────────────
  let toastTimer = null;
  function flashToast(msg) {
    setToast(msg);
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => setToast(""), 2200);
  }

  const patch = async (key, value) => {
    playUI("tap");
    const next = { ...shared, [key]: value };
    setShared(next);
    onUpdated?.(next);
    try {
      const saved = await updateShareSettings(shared.id, { [key]: value });
      if (saved) { setShared(saved); onUpdated?.(saved); }
    } catch (e) {
      console.warn("[ShareModal] updateShareSettings", e);
    }
  };

  const onCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      playUI("commit");
      flashToast("✓ Copied to clipboard");
    } catch {
      flashToast("Could not copy — long-press the link to copy");
    }
  };

  const onShareLink = async () => {
    if (!shareUrl) return;
    playUI("commit");
    // Native share sheet is the gold-standard mobile flow — pick iMessage,
    // WhatsApp, Twitter, IG, etc. in one tap.  Falls back to copy.
    if (navigator.share) {
      try {
        await navigator.share({
          title: bracket.title || "Vote with me",
          text:  `Vote on "${bracket.title}" with me on The Bracket Club`,
          url:   shareUrl,
        });
        flashToast("Shared!");
        return;
      } catch (e) {
        if (e?.name === "AbortError") return;        // user dismissed
        // fall through to copy
      }
    }
    onCopy();
  };

  const onRevoke = async () => {
    if (!confirm("Revoke this share link?  Existing participant picks will stay in the database, but the link will stop working.")) return;
    playUI("back");
    try {
      await revokeShare(shared.id);
      const next = { ...shared, share_code: null };
      setShared(next);
      onUpdated?.(next);
      onClose?.();
    } catch (e) {
      console.warn("[ShareModal] revokeShare", e);
    }
  };

  const deadlineDate = shared.voting_closes_at
    ? new Date(shared.voting_closes_at).toISOString().slice(0, 10)
    : "";
  const onSetDeadline = (e) => {
    const v = e.target.value;
    if (!v) { patch("voting_closes_at", null); return; }
    const d = new Date(v + "T23:59:59Z");
    patch("voting_closes_at", d.toISOString());
  };

  // ── Render ────────────────────────────────────────────────────────
  const overlay = (
    <div onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1400,
        background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
    >
      <div onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", color: "#1c1917",
          width: "100%", maxWidth: 520,
          borderRadius: "20px 20px 0 0",
          padding: "16px 18px 22px",
          display: "flex", flexDirection: "column", gap: 12,
          boxShadow: "0 -8px 40px rgba(0,0,0,0.35)",
          maxHeight: "92vh", overflowY: "auto",
          animation: "bcShareSlideUp 220ms ease-out",
        }}
      >
        <style>{`@keyframes bcShareSlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>

        <div style={{ width: 40, height: 4, background: "#e7e5e4", borderRadius: 2, alignSelf: "center" }} />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 18, color: "#14532d" }}>Invite friends to vote</div>
            <div style={{ fontSize: 12, color: "#78716c", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {bracket.title}
            </div>
          </div>
          <button onClick={onClose}
            style={{ background: "#f5f5f4", border: "none", color: "#1c1917", borderRadius: 99, width: 30, height: 30, fontSize: 14, cursor: "pointer", flexShrink: 0 }}>
            ✕
          </button>
        </div>

        {/* ── Generation states ──────────────────────────────────── */}
        {working && (
          <div style={{ background: "#f5f5f4", borderRadius: 12, padding: 18, color: "#78716c", fontSize: 13, textAlign: "center" }}>
            <div style={{ fontSize: 22, marginBottom: 6 }}>🔗</div>
            Setting up your share link…
          </div>
        )}

        {error && !working && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: 14, color: "#991b1b", fontSize: 12, textAlign: "center" }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Couldn't generate link</div>
            <div style={{ marginBottom: 10, fontSize: 11, opacity: 0.85 }}>{error}</div>
            <button onClick={() => setRetryNonce((n) => n + 1)}
              style={{ background: "#dc2626", color: "#fff", border: "none", borderRadius: 99, padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              Try again
            </button>
          </div>
        )}

        {shareUrl && !working && !error && (
          <>
            {/* Hero share button — primary CTA */}
            <button onClick={onShareLink}
              style={{
                width: "100%",
                background: "linear-gradient(135deg, #166534, #14532d)",
                color: "#fff", border: "none",
                borderRadius: 14, padding: "16px 18px",
                fontWeight: 800, fontSize: 16,
                cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                boxShadow: "0 6px 20px rgba(20,83,45,0.35)",
              }}>
              <span style={{ fontSize: 22 }}>📤</span>
              <span>Share Link via…</span>
            </button>

            {/* Link bar */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "#f0fdf4", border: "1.5px solid #86efac", borderRadius: 12,
              padding: "10px 12px",
            }}>
              <div style={{
                flex: 1, minWidth: 0,
                fontFamily: "ui-monospace, SFMono-Regular, monospace",
                fontSize: 12, color: "#14532d",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {shareUrl}
              </div>
              <button onClick={onCopy}
                style={{
                  background: "#14532d", color: "#fff",
                  border: "none", borderRadius: 8,
                  padding: "8px 14px", fontWeight: 700, fontSize: 12,
                  cursor: "pointer", whiteSpace: "nowrap",
                }}>
                📋 Copy
              </button>
            </div>

            {/* Toast */}
            {toast && (
              <div style={{
                background: "#dcfce7", color: "#15803d",
                borderRadius: 10, padding: "8px 12px",
                fontSize: 12, fontWeight: 700,
                textAlign: "center",
                animation: "bcToastFade 220ms ease-out",
              }}>
                <style>{`@keyframes bcToastFade { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
                {toast}
              </div>
            )}

            {/* Live count */}
            <div style={{
              display: "flex", justifyContent: "center", alignItems: "center", gap: 6,
              fontSize: 12, color: "#78716c",
            }}>
              <span style={{
                display: "inline-block", width: 6, height: 6, borderRadius: "50%",
                background: count > 0 ? "#22c55e" : "#d6d3d1",
              }} />
              <span>
                <strong style={{ color: "#1c1917", fontWeight: 800 }}>{count}</strong>
                {" "}
                {count === 1 ? "friend voting" : "friends voting"}
              </span>
            </div>
          </>
        )}

        {/* ── Settings ──────────────────────────────────────────── */}
        {shareUrl && !working && (
          <>
            <div style={{ height: 1, background: "#f5f5f4", margin: "4px 0" }} />
            <div style={{ fontSize: 11, fontWeight: 800, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1 }}>
              Settings
            </div>

            <Toggle
              label="Allow anonymous voting"
              hint="Friends can vote without signing in"
              value={shared.allow_anonymous}
              onChange={(v) => patch("allow_anonymous", v)}
            />
            <Toggle
              label="Show participant names"
              hint="Reveal who voted what to everyone"
              value={shared.show_participant_names}
              onChange={(v) => patch("show_participant_names", v)}
            />

            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#1c1917", marginBottom: 6 }}>
                Reveal community results
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {[
                  { id: "reveal_at_end", label: "At the end", hint: "Hide while voting" },
                  { id: "live",          label: "Live",       hint: "After every pick" },
                ].map((opt) => {
                  const active = shared.reveal_mode === opt.id;
                  return (
                    <button key={opt.id} onClick={() => patch("reveal_mode", opt.id)}
                      style={{
                        flex: 1, padding: "8px 6px",
                        background: active ? "#14532d" : "#fff",
                        color:      active ? "#fff"    : "#1c1917",
                        border: `1.5px solid ${active ? "#14532d" : "#e7e5e4"}`,
                        borderRadius: 10, fontWeight: 700, fontSize: 12,
                        cursor: "pointer",
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
                      }}>
                      <span>{opt.label}</span>
                      <span style={{ fontSize: 9, fontWeight: 500, opacity: 0.75 }}>{opt.hint}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#1c1917", marginBottom: 6 }}>
                Voting deadline
                <span style={{ fontWeight: 500, fontSize: 11, color: "#9ca3af", marginLeft: 6 }}>(optional)</span>
              </div>
              <input type="date"
                value={deadlineDate}
                onChange={onSetDeadline}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #e2e8f0", fontSize: 13, boxSizing: "border-box", background: "#fff" }}
              />
            </div>

            <button onClick={onRevoke}
              style={{ marginTop: 4, background: "none", border: "none", color: "#dc2626", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 6, alignSelf: "center" }}>
              Revoke share link
            </button>
          </>
        )}
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}

function Toggle({ label, hint, value, onChange }) {
  return (
    <button onClick={() => onChange(!value)}
      style={{
        background: "#fff", border: "none", padding: 0,
        display: "flex", alignItems: "center", gap: 12,
        cursor: "pointer", textAlign: "left",
      }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: "#1c1917" }}>{label}</div>
        {hint && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 1 }}>{hint}</div>}
      </div>
      <div style={{
        width: 40, height: 24, borderRadius: 12,
        background: value ? "#14532d" : "#d6d3d1",
        position: "relative", transition: "background .15s",
        flexShrink: 0,
      }}>
        <div style={{
          position: "absolute", top: 2, left: value ? 18 : 2,
          width: 20, height: 20, borderRadius: "50%",
          background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          transition: "left .15s",
        }} />
      </div>
    </button>
  );
}
