// Synthesized sound for NEON BAY: every effect and the music loop are built
// with the Web Audio API, so the game ships no audio files at all.
let audioCtx = null;
let masterGain = null;
let engineNodes = null;
let sirenNodes = null;
let musicTimer = null;
let muted = false;
let musicOn = false;

function ensureContext() {
  if (audioCtx) {
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    return audioCtx;
  }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = muted ? 0 : 0.55;
    masterGain.connect(audioCtx.destination);
  } catch (err) {
    audioCtx = null;
  }
  return audioCtx;
}

export function unlockAudio() {
  ensureContext();
}

export function setMuted(value) {
  muted = value;
  if (masterGain && audioCtx) masterGain.gain.value = muted ? 0 : 0.55;
  return muted;
}

export function isMuted() {
  return muted;
}

function noiseBuffer(seconds) {
  const ctx = ensureContext();
  if (!ctx) return null;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function blip(freq, dur, type, vol, slideTo) {
  const ctx = ensureContext();
  if (!ctx || !masterGain) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type || 'sine';
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
  gain.gain.setValueAtTime(vol || 0.2, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(gain); gain.connect(masterGain);
  osc.start(t); osc.stop(t + dur + 0.02);
}

function noiseHit(dur, vol, filterFreq) {
  const ctx = ensureContext();
  if (!ctx || !masterGain) return;
  const buffer = noiseBuffer(dur + 0.05);
  if (!buffer) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = filterFreq || 1200;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol || 0.3, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(filter); filter.connect(gain); gain.connect(masterGain);
  src.start(t); src.stop(t + dur + 0.05);
}

export function playGunshot() {
  noiseHit(0.14, 0.5, 2800);
  blip(160, 0.1, 'square', 0.18, 50);
}

export function playPunch() {
  blip(110, 0.12, 'sine', 0.4, 55);
  noiseHit(0.08, 0.2, 500);
}

export function playPickup() {
  blip(880, 0.09, 'sine', 0.22);
  setTimeout(() => blip(1318, 0.14, 'sine', 0.22), 80);
}

export function playCash() {
  blip(1046, 0.08, 'triangle', 0.2);
  setTimeout(() => blip(1568, 0.16, 'triangle', 0.2), 70);
}

export function playExplosion() {
  noiseHit(0.9, 0.7, 400);
  blip(70, 0.7, 'sine', 0.5, 28);
}

export function playSirenBlip() {
  blip(660, 0.18, 'square', 0.06, 660);
}

export function playMissionStart() {
  [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.22, 'triangle', 0.22), i * 110));
}

export function playMissionComplete() {
  [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => setTimeout(() => blip(f, 0.3, 'triangle', 0.22), i * 100));
}

export function playBusted() {
  [392, 330, 262, 196].forEach((f, i) => setTimeout(() => blip(f, 0.35, 'sawtooth', 0.12), i * 160));
}

export function playClick() {
  blip(1200, 0.05, 'square', 0.08);
}

export function playCrash() {
  noiseHit(0.25, 0.4, 900);
  blip(90, 0.2, 'sine', 0.3, 40);
}

export function playThunder() {
  noiseHit(1.6, 0.35, 220);
  setTimeout(() => noiseHit(1.2, 0.22, 160), 350);
}

export function playHorn() {
  blip(370, 0.28, 'square', 0.1, 370);
  blip(466, 0.28, 'square', 0.08, 466);
}

/** Continuous engine hum that follows the driven car's speed (0..1). */
export function setEngine(speedNorm, running) {
  const ctx = ensureContext();
  if (!ctx || !masterGain) return;
  if (!running || speedNorm <= 0.01) {
    if (engineNodes) {
      try { engineNodes.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.08); } catch (err) {}
    }
    return;
  }
  if (!engineNodes) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(filter); filter.connect(gain); gain.connect(masterGain);
    osc.start();
    engineNodes = { osc, filter, gain };
  }
  const t = ctx.currentTime;
  engineNodes.osc.frequency.setTargetAtTime(55 + speedNorm * 145, t, 0.06);
  engineNodes.filter.frequency.setTargetAtTime(500 + speedNorm * 1600, t, 0.06);
  engineNodes.gain.gain.setTargetAtTime(0.045 + speedNorm * 0.05, t, 0.08);
}

/** Two-tone police siren loop while wanted; call with false to stop it. */
export function setSiren(active) {
  const ctx = ensureContext();
  if (!ctx || !masterGain) return;
  if (!active) {
    if (sirenNodes) {
      try { sirenNodes.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.1); } catch (err) {}
    }
    return;
  }
  if (!sirenNodes) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 720;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 0.55;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain); lfoGain.connect(osc.frequency);
    osc.connect(gain); gain.connect(masterGain);
    osc.start(); lfo.start();
    sirenNodes = { osc, gain, lfo };
  }
  sirenNodes.gain.gain.setTargetAtTime(0.035, ctx.currentTime, 0.1);
}

// A slow neon-noir loop: Am – F – C – G pads over a soft bass pulse.
const CHORDS = [
  [110, 220, 261.6, 329.6],
  [87.3, 174.6, 261.6, 349.2],
  [130.8, 196, 261.6, 329.6],
  [98, 196, 246.9, 293.7],
];

export function startMusic() {
  if (musicOn || musicTimer) return;
  const ctx = ensureContext();
  if (!ctx || !masterGain) return;
  musicOn = true;
  let step = 0;
  const beatMs = 480;
  musicTimer = setInterval(() => {
    if (muted || !audioCtx) { step += 1; return; }
    const chord = CHORDS[Math.floor(step / 4) % CHORDS.length];
    if (step % 4 === 0) {
      blip(chord[0] / 2, 1.6, 'sine', 0.16);
      blip(chord[0], 1.6, 'triangle', 0.05);
    }
    if (step % 2 === 0) blip(chord[1 + (step % 2)], 0.5, 'sine', 0.035);
    if (step % 8 === 6) blip(chord[3] * 2, 0.4, 'sine', 0.03);
    step += 1;
  }, beatMs);
}

export function stopMusic() {
  musicOn = false;
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
}
