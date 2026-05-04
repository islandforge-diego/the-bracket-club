/**
 * soundscape.js — musical UI sound system.
 *
 * Every tap plays the *next* note in the active scale.  After 7 notes the
 * key modulates up a perfect fifth (circle of fifths: C → G → D → A → …).
 * After 30 seconds of inactivity the progression resets to the root.  The
 * result is that tapping around the app feels like the user is gently
 * noodling on an instrument — never random, always in key with what came
 * before.
 *
 * Capabilities:
 *   - Multiple scales (major, minor, lydian, mixolydian, harmonic_minor)
 *     swappable per-context via setScale() so the same melody can read
 *     happy/sad/dreamy/heroic/tense depending on what books are in play
 *   - Shared master gain + feedback-delay "reverb" tail so every voice
 *     sits in a tiny room — adds depth without per-call dependency
 *   - Variable tempo: tracks the user's tap rate and stretches/compresses
 *     note durations so rapid taps overlap into chords and slow deliberate
 *     taps ring with weight
 *   - Bass-voice option on playMelody for moments that need gravitas
 *     (champion crowning)
 *   - Continuous swipe tone (start/update/stop) — pitch tracks how far
 *     the user has dragged a card during a battle pick
 *   - Dramatic year-victory cadence (V7 → key modulation → resolution)
 *
 * One singleton AudioContext is created on first sound and reused for
 * everything.  Master gain is intentionally tiny — should be felt more
 * than heard.  User can mute via setMuted() (persisted to localStorage).
 */

const STORAGE_KEY  = "bc_sound_enabled";
const MASTER_GAIN  = 0.06;
const RESET_AFTER  = 30_000;      // ms of inactivity before scale resets
const ROOT_HZ      = 261.63;      // C4
const MODULATE_BY  = 7;           // semitones — perfect fifth (circle of fifths)

// ── Scales ──────────────────────────────────────────────────────────────────
//
// Each scale is an array of semitone offsets from the root.  Length should
// be 7 for diatonic scales — if you add a non-diatonic scale, the modulation
// math still works because we always step through indices 0..length-1.
const SCALES = {
  major:          [0, 2, 4, 5, 7, 9, 11],         // happy, default
  minor:          [0, 2, 3, 5, 7, 8, 10],         // sad, mysterious — horror
  lydian:         [0, 2, 4, 6, 7, 9, 11],         // dreamy, futuristic — sci-fi
  mixolydian:     [0, 2, 4, 5, 7, 9, 10],         // heroic, folk — fantasy
  harmonic_minor: [0, 2, 3, 5, 7, 8, 11],         // tense, exotic — thriller
};

// ── Variants: timbre + envelope only.  Pitch lives in the shared scale. ────
//
// type      — OscillatorNode wave (sine / triangle / square / sawtooth)
// dur       — total length in seconds (decay tail included)
// attack    — seconds to ramp from silence → peak
// gain      — peak gain relative to master (0..1)
// harmony   — true to add a major-third companion note (chord, not just note)
// octave    — pitch shift in octaves (-1, 0, +1, +2)
// regress   — true to step BACKWARD one degree (real "back" feel)
// fifthAbove — adds 7 semitones to the played note (without changing key)
const VARIANTS = {
  tap:    { type: "sine",     dur: 0.16, attack: 0.005, gain: 0.7, octave: 1 },
  select: { type: "triangle", dur: 0.22, attack: 0.005, gain: 0.85, octave: 1 },
  commit: { type: "triangle", dur: 0.36, attack: 0.005, gain: 1.0, octave: 1, harmony: true },
  back:   { type: "sine",     dur: 0.18, attack: 0.005, gain: 0.6, octave: 0, regress: true },
  next:   { type: "sine",     dur: 0.20, attack: 0.005, gain: 0.55, octave: 1, fifthAbove: true },
};

// ── Internal state ──────────────────────────────────────────────────────────
let ctx          = null;
let masterGain   = null;          // shared GainNode all sounds connect into
let degree       = 0;
let keyOffset    = 0;
let scaleId      = "major";
let lastNoteAt   = 0;
let recentGap    = 600;           // EMA ms — drives tempo modulation
let muted        = readMuted();

// Continuous swipe-tone state (one at a time — touch is single-finger here)
let swipeOsc     = null;
let swipeGain    = null;
let swipeBaseHz  = 0;

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

/**
 * Build the shared master + reverb effect chain on first use.
 *
 *   source(s) → masterGain ─┬─→ destination          (dry path)
 *                           └─→ delay → wetGain ─→ destination
 *                                  ↑       │
 *                                  └─ feedback gain
 *
 * Feedback delay (≈180 ms taps with ~0.3 feedback) approximates a small
 * room reverb without needing an impulse response file.  Wet level kept
 * deliberately low (~0.22) so it adds shimmer without muddying.
 */
function ensureChain(c) {
  if (masterGain) return;
  masterGain = c.createGain();
  masterGain.gain.value = MASTER_GAIN;

  const delay   = c.createDelay(1.0);
  delay.delayTime.value = 0.18;
  const fb      = c.createGain();
  fb.gain.value = 0.32;
  const wet     = c.createGain();
  wet.gain.value = 0.22;

  delay.connect(fb);
  fb.connect(delay);
  masterGain.connect(c.destination);                    // dry
  masterGain.connect(delay);
  delay.connect(wet);
  wet.connect(c.destination);                           // wet
}

function getScale() {
  return SCALES[scaleId] || SCALES.major;
}

/** Map recent tap gap → duration multiplier. */
function tempoFactor() {
  if (recentGap < 200) return 0.7;                      // fast: notes shorten + overlap
  if (recentGap > 1500) return 1.4;                     // slow: notes ring with weight
  return 1.0;
}

/** Resolve the next scale degree, advance state for next call. */
function pickDegree(opts) {
  const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
  if (now - lastNoteAt > RESET_AFTER) {
    degree = 0;
    keyOffset = 0;
    recentGap = 600;
  } else if (lastNoteAt > 0) {
    const gap = now - lastNoteAt;
    recentGap = recentGap * 0.7 + gap * 0.3;            // EMA
  }
  lastNoteAt = now;

  const scale = getScale();
  if (opts.regress) {
    degree = (degree - 1 + scale.length) % scale.length;
    return degree;
  }
  const used = degree;
  degree = (degree + 1) % scale.length;
  if (degree === 0) keyOffset = (keyOffset + MODULATE_BY) % 12;
  return used;
}

/** Convert (scale degree + key offset + extra octave/semis) → frequency Hz. */
function freqFor(scaleIdx, octave = 0, extraSemis = 0) {
  const scale = getScale();
  const semis = keyOffset + scale[scaleIdx % scale.length] + extraSemis + octave * 12;
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

// ── Public API: scale & state ────────────────────────────────────────────
export function setScale(id) {
  if (SCALES[id]) scaleId = id;
}
export function resetScale() {
  scaleId = "major";
}
export function getCurrentScale() {
  return scaleId;
}

/** Mute / unmute — persisted to localStorage so preference survives reload. */
export function setMuted(value) {
  muted = !!value;
  if (typeof window !== "undefined") {
    try { localStorage.setItem(STORAGE_KEY, muted ? "0" : "1"); } catch { /* ignore */ }
  }
  if (muted) stopSwipeTone();                           // kill any active continuous tone
}
export function isMuted() { return muted; }

/** Reset the musical position — useful if you want a "fresh start" sound. */
export function resetSoundscape() {
  degree = 0;
  keyOffset = 0;
  lastNoteAt = 0;
  recentGap = 600;
}

// ── Public API: single UI sounds ────────────────────────────────────────────
export function playUI(variantName = "tap") {
  if (muted) return;
  const v = VARIANTS[variantName] || VARIANTS.tap;
  const c = ensureCtx();
  if (!c) return;
  ensureChain(c);
  if (c.state === "suspended") c.resume().catch(() => {});

  const idx = pickDegree(v);
  const dur = v.dur * tempoFactor();
  const baseFreq = freqFor(idx, v.octave, v.fifthAbove ? 7 : 0);

  playVoice(c, baseFreq, v.type, v.attack, dur, v.gain, masterGain);
  if (v.harmony) {
    playVoice(c, baseFreq * Math.pow(2, 4 / 12), v.type, v.attack, dur * 0.85, v.gain * 0.55, masterGain);
  }
}

// ── Special sounds: melodies in the *current* key ───────────────────────────
//
// These don't advance the per-tap soundscape — they reference the existing
// keyOffset so they stay harmonically related to whatever the user has been
// tapping.  Used for moments bigger than a single tap: crowning a champion,
// starting a battle, the very first welcome on load.
//
// Note shape: { d: scaleDegree, o: octave, dur?: seconds, gain?: 0..1 }

/**
 * Play a sequence of scale-degree notes in the current key & scale.  Notes
 * play sequentially with `gap` seconds between starts.  Cumulative ringing
 * is intentional — it builds chord-like resonance.
 *
 * opts.bass = true adds a low root drone underneath the whole melody for
 * weight (used by the champion victory chime).
 */
export function playMelody(notes, opts = {}) {
  if (muted) return;
  const c = ensureCtx();
  if (!c) return;
  ensureChain(c);
  if (c.state === "suspended") c.resume().catch(() => {});

  const type    = opts.type    || "triangle";
  const dur     = opts.dur     || 0.30;
  const gap     = opts.gap     || 0.12;
  const gain    = opts.gain    || 1.0;
  const attack  = opts.attack  || 0.005;
  const tFactor = tempoFactor();

  // Per-melody gain knob — sits between voices and the shared master.
  const melMaster = c.createGain();
  melMaster.gain.value = gain;
  melMaster.connect(masterGain);

  const t0 = c.currentTime;
  notes.forEach((n, i) => {
    const d = n.d ?? 0;
    const o = n.o ?? 1;
    const noteDur = (n.dur ?? dur) * tFactor;
    const noteGain = n.gain ?? 0.85;
    const freq = freqFor(d, o);
    playVoice(c, freq, type, attack, noteDur, noteGain, melMaster, t0 + i * gap);
  });

  if (opts.bass) {
    // Low root drone, sine wave, lasts as long as the longest melody note
    const tail = Math.max(...notes.map((n) => (n.dur ?? dur) * tFactor));
    const total = (notes.length - 1) * gap + tail;
    const bassFreq = freqFor(0, 0);                     // root, lowest octave
    playVoice(c, bassFreq, "sine", 0.04, total + 0.3, 0.45, melMaster, t0);
  }
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
      { d: 0, o: 1, dur: 0.22 },
      { d: 4, o: 1, dur: 0.22 },
      { d: 0, o: 2, dur: 0.55, gain: 0.95 },
    ],
    { type: "triangle", gap: 0.18, gain: 1.0 },
  );
}

/** Bracket champion crowned — full triad + octave + bass drone for weight. */
export function playVictoryInKey() {
  playMelody(
    [
      { d: 0, o: 1, dur: 0.40 },
      { d: 2, o: 1, dur: 0.40 },
      { d: 4, o: 1, dur: 0.40 },
      { d: 0, o: 2, dur: 0.85 },
    ],
    { type: "triangle", gap: 0.10, gain: 1.0, bass: true },
  );
}

/**
 * Year champion — the BIG moment.  Plays a deceptive V7-style chord, pauses,
 * modulates the soundscape up a perfect fifth (so the next interaction starts
 * fresh in a new key), then fires the regular victory chime in the new key.
 *
 * The cycle reset isn't visual — it's musical.  Crowning the year creates a
 * permanent shift in the soundscape: tapping after this will start from the
 * new key.
 */
export function playYearVictory() {
  if (muted) return;
  const c = ensureCtx();
  if (!c) return;
  ensureChain(c);
  if (c.state === "suspended") c.resume().catch(() => {});

  const t0 = c.currentTime;

  // V7 chord built off the 5th of the current key
  // V = key + 7 semis; chord notes in semis from root: 0, 4, 7, 10 (dom 7)
  const v7Master = c.createGain();
  v7Master.gain.value = 0.9;
  v7Master.connect(masterGain);
  const v7Notes = [0, 4, 7, 10];
  v7Notes.forEach((s, i) => {
    const freq = ROOT_HZ * Math.pow(2, (keyOffset + 7 + s + 12) / 12);   // octave up
    playVoice(c, freq, "triangle", 0.01, 0.7, 0.65, v7Master, t0 + i * 0.05);
  });

  // After the V7 lingers ~750ms, modulate up a fifth and fire victory in NEW key
  setTimeout(() => {
    keyOffset = (keyOffset + MODULATE_BY) % 12;
    degree = 0;
    playVictoryInKey();
  }, 750);
}

/** Soft welcome chime — fired on the user's first gesture each session. */
export function playWelcome() {
  playMelody(
    [{ d: 0, o: 1 }, { d: 2, o: 1 }, { d: 4, o: 1 }],
    { type: "sine", dur: 0.40, gap: 0.18, gain: 0.7 },
  );
}

// ── Continuous swipe tone ───────────────────────────────────────────────────
//
// Active during a swipe-to-pick gesture on a 1v1 battle card.  Pitch tracks
// how far the user has dragged toward one side: center = current degree,
// drag left = bend down a tone, drag right = bend up a tone.

/** Start the swipe tone (fades in from silence).  Idempotent. */
export function startSwipeTone() {
  if (muted) return;
  if (swipeOsc) return;                                 // already running
  const c = ensureCtx();
  if (!c) return;
  ensureChain(c);
  if (c.state === "suspended") c.resume().catch(() => {});

  swipeOsc  = c.createOscillator();
  swipeGain = c.createGain();
  swipeOsc.type = "sine";
  swipeBaseHz = freqFor(degree, 1);
  swipeOsc.frequency.value = swipeBaseHz;
  swipeGain.gain.value = 0.0001;
  swipeGain.gain.exponentialRampToValueAtTime(0.45, c.currentTime + 0.04);
  swipeOsc.connect(swipeGain);
  swipeGain.connect(masterGain);
  swipeOsc.start();
}

/** Update swipe tone pitch.  progress: -1 (full left) → 0 (center) → +1 (right). */
export function updateSwipeTone(progress) {
  if (!swipeOsc || !ctx) return;
  const semis = Math.max(-1, Math.min(1, progress)) * 2;     // ±2 semitones
  const freq  = swipeBaseHz * Math.pow(2, semis / 12);
  swipeOsc.frequency.setValueAtTime(freq, ctx.currentTime);
}

/** Stop the swipe tone with a quick fade. */
export function stopSwipeTone() {
  if (!swipeOsc || !ctx) return;
  const t = ctx.currentTime;
  try {
    swipeGain.gain.cancelScheduledValues(t);
    swipeGain.gain.setValueAtTime(swipeGain.gain.value, t);
    swipeGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    swipeOsc.stop(t + 0.10);
  } catch { /* may already be stopped */ }
  swipeOsc  = null;
  swipeGain = null;
  swipeBaseHz = 0;
}
