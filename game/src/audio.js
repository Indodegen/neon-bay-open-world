// NEON BAY — audio.js
// Fully synthesized WebAudio sound: no audio files, no network. Engine hum,
// sirens, gunshots, explosions, pickups, mission jingles and a looping
// bass-driven music track, all built from oscillators and filtered noise.
// Everything is guarded: with no user gesture yet the context stays suspended
// and every call is a safe no-op.

export class NeonAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.musicTimer = null;
    this.musicStep = 0;
    this.started = false;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.16;
      this.musicGain.connect(this.master);
      return true;
    } catch {
      return false;
    }
  }

  unlock() {
    if (this.ensure() && !this.started) {
      this.started = true;
      this.startEngine();
      this.startMusic();
    }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.value = m ? 0 : 0.5;
  }

  noiseBuffer(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  blip(freq, dur, type, vol, slideTo) {
    if (!this.ensure() || this.muted) return;
    try {
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
      g.gain.setValueAtTime(vol || 0.2, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + dur + 0.02);
    } catch { /* audio is decoration, never fatal */ }
  }

  noiseHit(dur, vol, filterFreq, type) {
    if (!this.ensure() || this.muted) return;
    try {
      const t = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer(dur + 0.05);
      const f = this.ctx.createBiquadFilter();
      f.type = type || 'lowpass';
      f.frequency.value = filterFreq || 1200;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol || 0.3, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(f).connect(g).connect(this.master);
      src.start(t);
      src.stop(t + dur + 0.05);
    } catch { /* ignore */ }
  }

  gunshot() { this.noiseHit(0.14, 0.5, 2600, 'highpass'); this.blip(180, 0.09, 'square', 0.25, 60); }
  punch() { this.noiseHit(0.08, 0.3, 500); }
  explosion() {
    this.noiseHit(0.9, 0.7, 400);
    this.blip(90, 0.8, 'sine', 0.6, 28);
  }
  pickup() { this.blip(660, 0.1, 'sine', 0.25); setTimeout(() => this.blip(990, 0.14, 'sine', 0.25), 90); }
  cashRegister() {
    this.blip(880, 0.1, 'triangle', 0.25);
    setTimeout(() => this.blip(1174, 0.1, 'triangle', 0.25), 100);
    setTimeout(() => this.blip(1568, 0.22, 'triangle', 0.25), 200);
  }
  missionJingle() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((n, i) => setTimeout(() => this.blip(n, 0.22, 'triangle', 0.28), i * 130));
  }
  failSting() {
    this.blip(220, 0.3, 'sawtooth', 0.2, 110);
    setTimeout(() => this.blip(165, 0.5, 'sawtooth', 0.2, 82), 220);
  }
  sirenBlip() { this.blip(950, 0.28, 'sine', 0.12, 1250); }
  horn() { this.blip(320, 0.22, 'square', 0.15, 300); }
  skid() { this.noiseHit(0.25, 0.12, 1800, 'bandpass'); }

  startEngine() {
    if (!this.ctx) return;
    try {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const f = this.ctx.createBiquadFilter();
      o.type = 'sawtooth';
      o.frequency.value = 55;
      f.type = 'lowpass';
      f.frequency.value = 320;
      g.gain.value = 0;
      o.connect(f).connect(g).connect(this.master);
      o.start();
      this.engineOsc = o;
      this.engineGain = g;
    } catch { /* ignore */ }
  }

  setEngine(speed01, on) {
    if (!this.engineOsc || !this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      this.engineOsc.frequency.setTargetAtTime(52 + speed01 * 130, t, 0.08);
      this.engineGain.gain.setTargetAtTime(on ? 0.05 + speed01 * 0.05 : 0, t, 0.12);
    } catch { /* ignore */ }
  }

  startMusic() {
    if (this.musicTimer || !this.ctx) return;
    // Neon Bay FM: a 16-step bassline in A minor over a soft hat pulse.
    const bass = [55, 0, 55, 65.4, 0, 55, 0, 49, 55, 0, 55, 65.4, 82.4, 0, 73.4, 65.4];
    const stepMs = 145;
    this.musicTimer = setInterval(() => {
      if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
      try {
        const step = this.musicStep % 16;
        const b = bass[step];
        if (b) this.musicNote(b, stepMs / 1000 * 0.9, 'triangle', 0.5);
        if (step % 4 === 2) this.musicNote(220, 0.08, 'sine', 0.12);
        if (step % 2 === 0) this.hatTick();
        this.musicStep++;
      } catch { /* ignore */ }
    }, stepMs);
  }

  musicNote(freq, dur, type, vol) {
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.musicGain);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  hatTick() {
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer(0.04);
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 6000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    src.connect(f).connect(g).connect(this.musicGain);
    src.start(t);
  }
}
