/**
 * LoginModal.jsx — Sign in / Sign up sheet.
 *
 * Shows as a bottom sheet on mobile, centered modal on desktop.
 * Three modes: "signin", "signup", "forgot".
 *
 * Google OAuth works immediately after setting up the Google provider in the
 * Supabase dashboard (Authentication → Providers → Google).
 */

import { useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "./AuthContext.jsx";

const INPUT = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: 10,
  border: "1.5px solid #e2e8f0",
  fontSize: 15,
  outline: "none",
  boxSizing: "border-box",
  marginBottom: 12,
  background: "#fff",
};

const BTN = {
  width: "100%",
  padding: "12px",
  borderRadius: 10,
  border: "none",
  cursor: "pointer",
  fontSize: 15,
  fontWeight: 600,
};

export default function LoginModal({ onClose }) {
  const { signIn, signUp, signInWithGoogle } = useAuth();
  const [mode, setMode]     = useState("signin"); // "signin" | "signup"
  const [email, setEmail]   = useState("");
  const [pass, setPass]     = useState("");
  const [name, setName]     = useState("");
  const [consent, setConsent] = useState(true); // pre-checked, opt-in only on signup
  const [error, setError]   = useState(null);
  const [busy, setBusy]     = useState(false);
  const [sent, setSent]     = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const { error: err } = mode === "signup"
      ? await signUp({ email, password: pass, displayName: name, marketingConsent: consent })
      : await signIn({ email, password: pass });

    setBusy(false);
    if (err) { setError(err.message); return; }
    if (mode === "signup") { setSent(true); return; }
    onClose();
  }

  async function handleGoogle() {
    setBusy(true);
    // Google is treated as both sign-in and sign-up. Capture consent only when
    // the modal is in signup mode so existing users aren't re-opted-in.
    const { error: err } = await signInWithGoogle({
      marketingConsent: mode === "signup" ? consent : false,
    });
    setBusy(false);
    if (err) setError(err.message);
    // OAuth redirects away — no onClose needed
  }

  const overlay = (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.45)", display: "flex",
        alignItems: "flex-end", justifyContent: "center",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: "20px 20px 0 0",
          padding: "28px 24px 36px", width: "100%", maxWidth: 440,
          boxShadow: "0 -4px 40px rgba(0,0,0,0.12)",
        }}
      >
        {/* Handle bar */}
        <div style={{ width: 40, height: 4, borderRadius: 2, background: "#e2e8f0", margin: "0 auto 24px" }} />

        {sent ? (
          <div style={{ textAlign: "center", padding: "12px 0" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📬</div>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Check your email</div>
            <div style={{ color: "#64748b", fontSize: 14, marginBottom: 20 }}>
              We sent a confirmation link to <strong>{email}</strong>
            </div>
            <button onClick={onClose} style={{ ...BTN, background: "#f1f5f9", color: "#1e293b" }}>
              Done
            </button>
          </div>
        ) : (
          <>
            <div style={{ fontWeight: 800, fontSize: 22, marginBottom: 4 }}>
              {mode === "signin" ? "Welcome back" : "Create account"}
            </div>
            <div style={{ color: "#64748b", fontSize: 14, marginBottom: 24 }}>
              {mode === "signin"
                ? "Sign in to sync your shelf across devices."
                : "Save your shelf and join the community."}
            </div>

            {/* Google */}
            <button
              onClick={handleGoogle}
              disabled={busy}
              style={{ ...BTN, background: "#fff", border: "1.5px solid #e2e8f0", color: "#1e293b", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}
            >
              <svg width="18" height="18" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              Continue with Google
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <div style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
              <span style={{ color: "#94a3b8", fontSize: 13 }}>or</span>
              <div style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
            </div>

            <form onSubmit={handleSubmit}>
              {mode === "signup" && (
                <input
                  style={INPUT} type="text" placeholder="Display name"
                  value={name} onChange={e => setName(e.target.value)} required
                />
              )}
              <input
                style={INPUT} type="email" placeholder="Email"
                value={email} onChange={e => setEmail(e.target.value)} required
              />
              <input
                style={INPUT} type="password" placeholder="Password"
                value={pass} onChange={e => setPass(e.target.value)} required minLength={6}
              />

              {mode === "signup" && (
                <label style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13, color: "#475569", marginBottom: 14, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={e => setConsent(e.target.checked)}
                    style={{ marginTop: 2, cursor: "pointer" }}
                  />
                  <span>
                    Send me occasional updates about new features and categories — you're an early user, your input matters.
                  </span>
                </label>
              )}

              {error && (
                <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 12, padding: "8px 12px", background: "#fef2f2", borderRadius: 8 }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                style={{ ...BTN, background: "#1e293b", color: "#fff", marginBottom: 12 }}
              >
                {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
              </button>
            </form>

            <div style={{ textAlign: "center", fontSize: 14, color: "#64748b" }}>
              {mode === "signin" ? (
                <>No account?{" "}
                  <button onClick={() => { setMode("signup"); setError(null); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#6366f1", fontWeight: 600 }}>
                    Sign up
                  </button>
                </>
              ) : (
                <>Already have one?{" "}
                  <button onClick={() => { setMode("signin"); setError(null); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#6366f1", fontWeight: 600 }}>
                    Sign in
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
