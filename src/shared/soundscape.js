/**
 * soundscape.js — musical UI sound system.
 *
 * Every tap plays the *next* note in a major scale.  After 7 notes the key
 * modulates up a perfect fifth (circle of fifths: C → G → D → A → …).  After
 * 30 seconds of inactivity the progression resets to the root.  The result
 * is that tapping around the app feels like the user is gently noodling on
 * an instrument — never random, always in key with what came before.
 *
 * Architecture notes:
 *   - One singleton AudioContext, lazy-created on first sound
 *   - Variants change *timbre* (sine vs triangle, attack/release, harmony)
 *     not the underlying scale degree, so the musical line stays coherent
 *   - Master volume defaults to a deliberately tiny 0.06 — should be felt
 *     more than heard.  User can mute via setMuted() (persisted to
 *     localStorage at bc_sound_enabled).
 *   - Big celebratory sounds (the bracket VictoryScreen chime) live
 *     elsewhere — this module is only for ambient interaction feedback.
 */

const STORAGE_KEY  = "bc_sound_enabled";
const MASTER_GAIN  = 0.06;
const RESET_AFTER  = 30_000;      // ms of inactivity before scale resets
const SCALE_LEN    = 7;           // notes in a major scale (no octave repeat)
const MAJOR_SCALE  = [0, 2, 4, 5, 7, 9, 11];          // semitones from root
const ROOT_HZ      = 261.63;      // C4
const MODULATE_BY  = 7;           // semitones — perfect fifth (circle of fifths)

// ── Variants: timbre + envelope only.  Pitch lives in the shared scale. ────
//
// type      — OscillatorNode wave (sine / triangle / square / sawtooth)
// dur       — total length in seconds (decay tail included)
// attack    — seconds to ramp from silence → peak
// gain      — peak gain relative to master (0..1)
// harmony   — true to add a major-third companion note (chord, not just note)
// octave    — pitch shift in octaves (-1, 0, +1, +2)
// regress   — true to NOT advance the scale (replay current degree, e.g. back btn)
// fifthAbove — adds 7 semitones to the played note (without changing key)
const VARIANTS = {
  // soft, very subtle — generic taps, year picker, tab switches
  tap:    { type: "sine",     dur: 0.16, attack: 0.005, gain: 0.7, octave: 1 },
  // a bit fuller — selecting a thing (book, month, option)
  select: { type: "triangle", dur: 0.22, attack: 0.005, gain: 0.85, octave: 1 },
  // commit / confirm — vote in a battle, crown a winner.  Adds harmony.
  commit: { type: "triangle", dur: 0.36, attack: 0.005, gain: 1.0, octave: 1, harmony: true },
  // back / cancel — plays one octave lower, no advance to keep flow stable
  back:   { type: "sine",     dur: 0.18, attack: 0.005, gain: 0.6, octave: 0, regress: true },
  // soft ding for transitions / auto-advance — fifth above current note
  next:   { type: "sine",     dur: 0.20, attack: 0.005, gain: 0.55, octave: 1, fifthAbove: true },
};

// ── Internal state ──────────────────────────────────────────────────────────
let ctx          = null;
let degree       = 0;             // current scale degree (0..SCALE_LEN-1)
let keyOffset    = 0;             // semitones above C, advances every SCALE_LEN notes
let lastNoteAt   = 0;             // ms timestamp of last note
let muted        = readMuted();

function readMuted() {
  if (typeof window === "undefined") return false;
  try { return localStorage.getItem(STORAGE_KEY) === "0"; } catch { return false; }
}

function ensureCtx() {
  if (ctx) return ctx;
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try { ctx = new AC(); return ctx; } catch { return null; }
}

/** Resolve which scale degree to play, then advance state for next call. */
function pickDegree(opts) {
  const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
  if (now - lastNoteAt > RESET_AFTER) {
    degree = 0;
    keyOffset = 0;
  }
  lastNoteAt = now;

  const useDegree = degree;
  if (!opts.regress) {
    degree = (degree + 1) % SCALE_LEN;
    if (degree === 0) {
      keyOffset = (keyOffset + MODULATE_BY) % 12;     // modulate up a fifth
    }
  }
  return useDegree;
}

/** Convert (scale degree + key offset + extra octave/semis) → frequency Hz. */
function freqFor(scaleIdx, octave = 0, extraSemis = 0) {
  const semis = keyOffset + MAJOR_SCALE[scaleIdx] + extraSemis + octave * 12;
  return ROOT_HZ * Math.pow(2, semis / 12);
}

/** Schedule a single voice (osc + envelope) into the destination. */
function playVoice(c, freq, type, attack, dur, gain, dest, startAt) {
  const t   = startAt ?? c.currentTime;
  const osc = c.createOscillator();
  const env = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(Math.max(gain, 0.001), t + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(env);
  env.connect(dest);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

/** Public: play a UI sound by variant.  No-op if muted or audio unavailable. */
export function playUI(variantName = "tap") {
  if (muted) return;
  const v = VARIANTS[variantName] || VARIANTS.tap;
  const c = ensureCtx();
  if (!c) return;

  // iOS Safari starts contexts suspended; user gesture (the click that
  // triggered this call) lets us resume.  Fire-and-forget the promise.
  if (c.state === "suspended") c.resume().catch(() => {});

  const idx = pickDegree(v);
  const baseFreq = freqFor(idx, v.octave, v.fifthAbove ? 7 : 0);

  const master = c.createGain();
  master.gain.value = MASTER_GAIN;
  master.connect(c.destination);

  // Main note
  playVoice(c, baseFreq, v.type, v.attack, v.dur, v.gain, master);

  // Optional harmony note — major third up, quieter than the root
  if (v.harmony) {
    const harmonyFreq = baseFreq * Math.pow(2, 4 / 12);   // +4 semitones
    playVoice(c, harmonyFreq, v.type, v.attack, v.dur * 0.85, v.gain * 0.55, master);
  }
}

/** Mute / unmute — persisted to localStorage so preference survives reload. */
export function setMuted(value) {
  muted = !!value;
  if (typeof window !== "undefined") {
    try { localStorage.setItem(STORAGE_KEY, muted ? "0" : "1"); } catch { /* ignore */ }
  }
}
export function isMuted() { return muted; }

/** Reset the musical position — useful if you want a "fresh start" sound. */
export function resetSoundscape() {
  degree = 0;
  keyOffset = 0;
  lastNoteAt = 0;
}

// ─── Special sounds: melodies in the *current* key ──────────────────────────
//
// These don't advance the per-tap soundscape progression — they reference
// the *existing* keyOffset so they stay harmonically related to whatever
// the user has been tapping.  Used for moments bigger than a single tap:
// crowning a champion, starting a battle, the very first welcome on load.
//
// Note shape: { d: scaleDegree, o: octave, dur?: seconds }
//   - d: 0..6 indexes into MAJOR_SCALE (0=root, 2=third, 4=fifth, …)
//   - o: 1 = base octave (C5 in C major), 2 = octave up, etc.
//   - dur: optional length override (defaults to opts.dur)

/**
 * Play a sequence of scale-degree notes in the current key.  Notes play
 * sequentially with `gap` seconds between starts.  Cumulative ringing is
 * intentional — it builds chord-like resonance.
 */
export function playMelody(notes, opts = {}) {
  if (muted) return;
  const c = ensureCtx();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});

  const type    = opts.type    || "triangle";
  const dur     = opts.dur     || 0.30;
  const gap     = opts.gap     || 0.12;
  const gain    = opts.gain    || 1.0;
  const attack  = opts.attack  || 0.005;

  const t0 = c.currentTime;
  const master = c.createGain();
  master.gain.value = MASTER_GAIN * gain;
  master.connect(c.destination);

  notes.forEach((n, i) => {
    const d = n.d ?? 0;
    const o = n.o ?? 1;
    const noteDur = n.dur ?? dur;
    const noteGain = n.gain ?? 0.85;
    const freq = freqFor(d, o);
    playVoice(c, freq, type, attack, noteDur, noteGain, master, t0 + i * gap);
  });

  // Auto-close context after the longest note finishes (only if not actively
  // playing UI sounds — but those create their own short-lived contexts via
  // playUI, so this is a no-op for them).  Skip auto-close to keep the
  // single shared context alive for subsequent calls.
}

/** Sparkly triad — used when starring a book to crown the month. */
export function playStar() {
  playMelody(
    [{ d: 0, o: 1 }, { d: 2, o: 1 }, { d: 4, o: 1 }, { d: 0, o: 2, dur: 0.45 }],
    { type: "triangle", dur: 0.18, gap: 0.08, gain: 1.1 },
  );
}

/** Dramatic 3-note rising fanfare — when entering a 1v1 battle screen. */
export function playBattleStart() {
  playMelody(
    [
      { d: 0, o: 1, dur: 0.22 },         // root
      { d: 4, o: 1, dur: 0.22 },         // fifth
      { d: 0, o: 2, dur: 0.55, gain: 0.95 }, // octave up, held longer
    ],
    { type: "triangle", gap: 0.18, gain: 1.0 },
  );
}

/** Bracket champion crowned — full triad + octave, longer notes. */
export function playVictoryInKey() {
  playMelody(
    [
      { d: 0, o: 1, dur: 0.40 },
      { d: 2, o: 1, dur: 0.40 },
      { d: 4, o: 1, dur: 0.40 },
      { d: 0, o: 2, dur: 0.85 },
    ],
    { type: "triangle", gap: 0.10, gain: 1.0 },
  );
}

/** Soft welcome chime — fired on the user's first gesture each session. */
export function playWelcome() {
  playMelody(
    [{ d: 0, o: 1 }, { d: 2, o: 1 }, { d: 4, o: 1 }],
    { type: "sine", dur: 0.40, gap: 0.18, gain: 0.7 },
  );
}
