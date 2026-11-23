// Synthesized WebAudio sound: no external audio files, everything is oscillators + noise.
export class AudioEngine {
  constructor() {
    this.ctx = null; this.muted = false;
    this.engineOsc = null; this.engineGain = null;
    this.sirenOsc = null; this.sirenGain = null; this.sirenLfo = null;
  }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    // Engine hum: two detuned sawtooth oscillators through a lowpass.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth'; this.engineOsc.frequency.value = 55;
    const o2 = this.ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 28;
    this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    this.engineOsc.connect(lp); o2.connect(lp); lp.connect(this.engineGain); this.engineGain.connect(this.ctx.destination);
    this.engineOsc.start(); o2.start();
    // Police siren: triangle wave wobbling between two tones.
    this.sirenOsc = this.ctx.createOscillator(); this.sirenOsc.type = 'triangle'; this.sirenOsc.frequency.value = 750;
    this.sirenLfo = this.ctx.createOscillator(); this.sirenLfo.type = 'square'; this.sirenLfo.frequency.value = 0.55;
    const lfoGain = this.ctx.createGain(); lfoGain.gain.value = 180;
    this.sirenLfo.connect(lfoGain); lfoGain.connect(this.sirenOsc.frequency);
    this.sirenGain = this.ctx.createGain(); this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.ctx.destination);
    this.sirenOsc.start(); this.sirenLfo.start();
  }
  setEngine(speed01, driving) {
    if (!this.ctx || this.muted) { if (this.engineGain) this.engineGain.gain.value = 0; return; }
    // Engine hum sits a touch louder so the car feels present at speed.
    this.engineGain.gain.setTargetAtTime(driving ? 0.06 + speed01 * 0.08 : 0.02, this.ctx.currentTime, 0.1);
    this.engineOsc.frequency.setTargetAtTime(50 + speed01 * 130, this.ctx.currentTime, 0.1);
  }
  setSiren(on) {
    if (!this.ctx) return;
    this.sirenGain.gain.setTargetAtTime(on && !this.muted ? 0.045 : 0, this.ctx.currentTime, 0.2);
  }
  blip(freq = 880, dur = 0.12, type = 'sine', vol = 0.18) {
    if (!this.ctx || this.muted) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.connect(g); g.connect(this.ctx.destination); o.start(); o.stop(this.ctx.currentTime + dur);
  }
  pickup() { this.blip(660, 0.09); setTimeout(() => this.blip(990, 0.14), 80); }
  cash() { this.blip(523, 0.1); setTimeout(() => this.blip(659, 0.1), 90); setTimeout(() => this.blip(784, 0.18), 180); }
  gunshot() {
    if (!this.ctx || this.muted) return;
    const len = this.ctx.sampleRate * 0.12;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    // Gunshots hit harder (0.35 → 0.4) so combat has weight.
    const g = this.ctx.createGain(); g.gain.value = 0.4;
    src.connect(g); g.connect(this.ctx.destination); src.start();
  }
  crash() { this.blip(90, 0.25, 'sawtooth', 0.3); }
  toggleMute() { this.muted = !this.muted; if (this.sirenGain) this.setSiren(false); return this.muted; }
}
