/**
 * BracketShareModal — author-side modal for inviting friends to vote.
 *
 * Triggered from CustomBracketView's header.  Generates a share_code on
 * first open (lazy — the bracket is solo until the author actually shares),
 * shows the public URL with copy + native-share buttons, and exposes the
 * four sharing toggles:
 *
 *   • Allow anonymous voting
 *   • Show participant names
 *   • Reveal results: live vs. at end
 *   • Voting deadline (optional date picker)
 *
 * Live participant count refreshes every few seconds while the modal is
 * open so the author sees friends arrive.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  shareBracket,
  revokeShare,
  updateShareSettings,
  countParticipations,
} from "../lib/multiplayerSync.js";
import { playUI } from "./soundscape.js";

const REFRESH_MS = 6000;

export default function BracketShareModal({ bracket, onUpdated, onClose }) {
  // We treat the modal as authoritative — once mounted, ensure the bracket
  // has a share_code.  shareBracket() is idempotent.
  const [working, setWorking] = useState(!bracket.share_code);
  const [shared,  setShared]  = useState(bracket);
  const [count,   setCount]   = useState(0);
  const [copied,  setCopied]  = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!shared.share_code) {
          const updated = await shareBracket(shared.id);
          if (!cancelled) { setShared(updated); onUpdated?.(updated); }
        }
      } catch (e) {
        console.warn("[ShareModal] shareBracket failed", e);
      } finally {
        if (!cancelled) setWorking(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Poll participant count
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

  const shareUrl = shared.share_code
    ? `${window.location.origin}/b/${shared.share_code}`
    : null;

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
      setCopied(true);
      playUI("commit");
      setTimeout(() => setCopied(false), 1600);
    } catch { /* ignore */ }
  };

  const onNativeShare = async () => {
    if (!shareUrl) return;
    playUI("tap");
    try {
      if (navigator.share) {
        await navigator.share({
          title: bracket.title || "Vote with me",
          text:  `Vote on "${bracket.title}" with me on The Bracket Club`,
          url:   shareUrl,
        });
      } else {
        onCopy();
      }
    } catch (e) {
      if (e?.name !== "AbortError") onCopy();
    }
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

  // Date picker — accept a yyyy-mm-dd value, store as ISO at end-of-day UTC
  const deadlineDate = shared.voting_closes_at
    ? new Date(shared.voting_closes_at).toISOString().slice(0, 10)
    : "";
  const onSetDeadline = (e) => {
    const v = e.target.value;
    if (!v) { patch("voting_closes_at", null); return; }
    const d = new Date(v + "T23:59:59Z");
    patch("voting_closes_at", d.toISOString());
  };

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
          display: "flex", flexDirection: "column", gap: 14,
          boxShadow: "0 -8px 40px rgba(0,0,0,0.35)",
          maxHeight: "92vh", overflowY: "auto",
        }}
      >
        <div style={{ width: 40, height: 4, background: "#e7e5e4", borderRadius: 2, alignSelf: "center" }} />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, color: "#14532d" }}>Share & Vote Together</div>
            <div style={{ fontSize: 12, color: "#78716c", marginTop: 2 }}>
              {bracket.title}
            </div>
          </div>
          <button onClick={onClose}
            style={{ background: "#f5f5f4", border: "none", color: "#1c1917", borderRadius: 99, width: 30, height: 30, fontSize: 14, cursor: "pointer" }}>
            ✕
          </button>
        </div>

        {/* ── Share link ─────────────────────────────────────────── */}
        {working ? (
          <div style={{ background: "#f5f5f4", borderRadius: 12, padding: 14, color: "#78716c", fontSize: 12, textAlign: "center" }}>
            Setting up share link…
          </div>
        ) : shareUrl ? (
          <>
            <div style={{
              background: "#f0fdf4", border: "1.5px solid #86efac", borderRadius: 12,
              padding: "10px 12px",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <div style={{ flex: 1, minWidth: 0, fontFamily: "ui-monospace, monospace", fontSize: 12, color: "#14532d", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {shareUrl}
              </div>
              <button onClick={onCopy}
                style={{ background: "#14532d", color: "#fff", border: "none", borderRadius: 8, padding: "6px 10px", fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>

            <button onClick={onNativeShare}
              style={{ width: "100%", background: "#14532d", color: "#fff", border: "none", borderRadius: 99, padding: "12px 14px", fontWeight: 800, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              📤 Share link
            </button>

            <div style={{ background: "#fafaf9", borderRadius: 10, padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: "#78716c" }}>Friends voting</span>
              <span style={{ fontWeight: 800, color: "#14532d" }}>{count}</span>
            </div>
          </>
        ) : null}

        {/* ── Settings ───────────────────────────────────────────── */}
        <div style={{ height: 1, background: "#f5f5f4" }} />

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

        {/* ── Danger zone ───────────────────────────────────────── */}
        {shareUrl && (
          <button onClick={onRevoke}
            style={{ marginTop: 4, background: "none", border: "none", color: "#dc2626", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 6, alignSelf: "center" }}>
            Revoke share link
          </button>
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
