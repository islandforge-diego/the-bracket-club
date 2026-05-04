/**
 * Welcome — first-load splash with two steps:
 *   1. Greeting    — "Welcome to The Bracket Club" + start CTA
 *   2. Genre quiz  — multi-select chips so we can match community brackets
 *                    to the user's taste.  Persisted via setPrefs().
 *
 * The genre quiz step is skippable; un-set genres just means community
 * brackets are shown in default (popularity) order rather than personalised.
 */

import { useState } from "react";
import { GENRE_OPTIONS, setPrefs } from "./userPreferences.js";

export default function Welcome({ config, onStartTour, onSkip }) {
  const [step,    setStep]    = useState("hello");      // "hello" | "genres"
  const [genres,  setGenres]  = useState(new Set());

  const toggleGenre = (id) => {
    setGenres((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else              next.add(id);
      return next;
    });
  };

  const finishGenres = () => {
    setPrefs({
      genres:      [...genres],
      onboardedAt: new Date().toISOString(),
    });
    onSkip();                                            // dismiss the welcome
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "rgba(0,0,0,0.7)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20,
    }}>
      <div style={{
        background: "#fff", borderRadius: 24, maxWidth: 380, width: "100%",
        overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,0.3)",
      }}>
        {step === "hello" && (
          <>
            <div style={{
              background: "linear-gradient(135deg, #14532d, #166534)",
              padding: "40px 28px 36px", textAlign: "center", color: "#fff",
            }}>
              <div style={{ fontSize: 56, marginBottom: 18 }}>🏆</div>
              <div style={{ fontWeight: 800, fontSize: 22, lineHeight: 1.35, marginBottom: 12 }}>
                Welcome to The Bracket Club
              </div>
              <div style={{ fontSize: 14, opacity: 0.82, lineHeight: 1.6 }}>
                Vote in book brackets the community is debating, or build your own.
              </div>
            </div>

            <div style={{ padding: "24px 20px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                onClick={() => setStep("genres")}
                style={{
                  padding: "15px 0", borderRadius: 14,
                  background: "#14532d", color: "#fff", border: "none",
                  fontWeight: 800, fontSize: 15, cursor: "pointer",
                }}
              >
                Get started →
              </button>
              <button
                onClick={onSkip}
                style={{
                  padding: "11px 0", borderRadius: 14,
                  background: "none", border: "none",
                  color: "#9ca3af", fontSize: 13, cursor: "pointer",
                }}
              >
                Skip
              </button>
            </div>
          </>
        )}

        {step === "genres" && (
          <>
            <div style={{ padding: "32px 24px 14px", textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📚</div>
              <div style={{ fontWeight: 800, fontSize: 19, color: "#1c1917", lineHeight: 1.3 }}>
                What do you like to read?
              </div>
              <div style={{ fontSize: 13, color: "#78716c", marginTop: 6, lineHeight: 1.5 }}>
                Pick a few — we'll surface brackets you'll care about.
              </div>
            </div>

            <div style={{
              display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8,
              padding: "10px 20px",
            }}>
              {GENRE_OPTIONS.map((g) => {
                const sel = genres.has(g.id);
                return (
                  <button key={g.id} onClick={() => toggleGenre(g.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "12px 12px",
                      background: sel ? "#f0fdf4" : "#fff",
                      border: `2px solid ${sel ? "#22c55e" : "#e7e5e4"}`,
                      borderRadius: 12, cursor: "pointer", textAlign: "left",
                      transition: "all 0.15s",
                    }}>
                    <span style={{ fontSize: 18 }}>{g.icon}</span>
                    <span style={{ fontWeight: 700, fontSize: 13, color: "#1c1917" }}>{g.label}</span>
                  </button>
                );
              })}
            </div>

            <div style={{ padding: "16px 20px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                onClick={finishGenres}
                style={{
                  padding: "14px 0", borderRadius: 14,
                  background: "#14532d", color: "#fff", border: "none",
                  fontWeight: 800, fontSize: 15, cursor: "pointer",
                }}
              >
                {genres.size === 0 ? "Skip & explore" : `Save ${genres.size} & explore`}
              </button>
              <button
                onClick={() => setStep("hello")}
                style={{
                  padding: "10px 0", borderRadius: 14,
                  background: "none", border: "none",
                  color: "#9ca3af", fontSize: 12, cursor: "pointer",
                }}
              >
                ‹ Back
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
