// NEON BAY — audio.js
// Fully synthesized WebAudio: no audio files. Engine hum, sirens, gunshots,
// explosions, footsteps, UI blips and a looping synthwave radio bed.
// Everything is created lazily on the first user gesture (browser autoplay
// policy) and guarded so a missing AudioContext never throws.

export function createAudio() {
  const A = {
    ctx: null, master: null, musicGain: null, sfxGain: null,
    muted: false, radio: 0, musicTimer: null, engineNodes: null,
    started: false,

    ensure() {
      // resume() returns a promise; swallow a rejection (e.g. the tab is
      // backgrounded) so audio setup can never throw into the game loop.
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return true; }
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        this.ctx = new AC();
        this.master = this.ctx.createGain(); this.master.gain.value = 0.55;
        this.master.connect(this.ctx.destination);
        this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = 0.9;
        this.sfxGain.connect(this.master);
        this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = 0.16;
        this.musicGain.connect(this.master);
        this.started = true;
        return true;
      } catch { return false; }
    },

    setMuted(m) {
      this.muted = m;
      if (this.master) this.master.gain.value = m ? 0 : 0.55;
    },

    // --- one-shot synth helpers -------------------------------------------
    blip(freq = 880, dur = 0.08, type = 'square', vol = 0.25) {
      if (!this.ensure()) return;
      // exponentialRampToValueAtTime throws if the starting value is 0,
      // so clamp the volume away from zero even for a silent blip.
      const v = Math.max(vol, 0.001);
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(v, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(this.sfxGain);
      o.start(t); o.stop(t + dur + 0.02);
    },
    noise(dur = 0.3, vol = 0.4, freq = 1200, q = 0.8) {
      if (!this.ensure()) return;
      const t = this.ctx.currentTime;
      const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource(); src.buffer = buf;
      const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
      const g = this.ctx.createGain(); g.gain.value = vol;
      src.connect(f); f.connect(g); g.connect(this.sfxGain);
      src.start(t);
    },
    sweep(f0, f1, dur = 0.4, type = 'sawtooth', vol = 0.3) {
      if (!this.ensure()) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(this.sfxGain);
      o.start(t); o.stop(t + dur + 0.02);
    },

    // --- game SFX -----------------------------------------------------------
    shot() { this.noise(0.12, 0.55, 2600, 0.6); this.blip(180, 0.09, 'square', 0.35); },
    punch() { this.noise(0.1, 0.4, 300, 1.2); },
    explosion() {
      this.noise(0.9, 0.9, 220, 0.5);
      this.sweep(120, 28, 0.8, 'sine', 0.7);
    },
    sirenTick() { this.sweep(700, 1050, 0.5, 'sine', 0.06); },
    crash() { this.noise(0.35, 0.6, 500, 0.7); this.sweep(220, 60, 0.25, 'square', 0.2); },
    pickup() { this.blip(660, 0.07, 'sine', 0.3); this.blip(990, 0.1, 'sine', 0.3); },
    cash() { this.blip(1320, 0.06, 'sine', 0.25); setTimeout(() => this.blip(1760, 0.12, 'sine', 0.25), 70); },
    door() { this.noise(0.12, 0.25, 900, 1); },
    radioSwitch() { this.noise(0.08, 0.2, 3200, 2); this.blip(520, 0.05, 'square', 0.15); },
    mission() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, 0.16, 'triangle', 0.3), i * 90)); },
    fail() { [392, 330, 262].forEach((f, i) => setTimeout(() => this.blip(f, 0.2, 'sawtooth', 0.18), i * 110)); },
    thunder() { this.noise(1.4, 0.5, 90, 0.4); },
    footsteps() { this.noise(0.05, 0.08, 400, 1); },

    // --- engine ---------------------------------------------------------------
    engineStart() {
      if (!this.ensure()) return;
      this.engineStop();
      const o = this.ctx.createOscillator(), o2 = this.ctx.createOscillator();
      const g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.value = 55;
      o2.type = 'square'; o2.frequency.value = 28;
      f.type = 'lowpass'; f.frequency.value = 420;
      g.gain.value = 0.05;
      o.connect(f); o2.connect(f); f.connect(g); g.connect(this.sfxGain);
      o.start(); o2.start();
      this.engineNodes = { o, o2, g };
    },
    engineSet(rpm01, load01) {
      const n = this.engineNodes; if (!n || !this.ctx) return;
      const t = this.ctx.currentTime;
      n.o.frequency.setTargetAtTime(48 + rpm01 * 130, t, 0.08);
      n.o2.frequency.setTargetAtTime(24 + rpm01 * 60, t, 0.08);
      n.g.gain.setTargetAtTime(0.03 + load01 * 0.05 + rpm01 * 0.03, t, 0.1);
    },
    engineStop() {
      const n = this.engineNodes; if (!n) return;
      try { n.o.stop(); n.o2.stop(); } catch {}
      this.engineNodes = null;
    },

    // --- radio music: a small synthwave sequencer ------------------------------
    // Am–F–C–G pad + bass + hat pattern, 96 BPM. Different stations shift
    // the waveform / tempo slightly; the track stays the same bed.
    startMusic() {
      if (!this.ensure() || this.musicTimer) return;
      const chords = [
        [110.0, 130.8, 164.8, 220.0], // Am
        [87.3, 110.0, 130.8, 174.6], // F
        [130.8, 164.8, 196.0, 261.6],// C
        [98.0, 123.5, 146.8, 196.0], // G
      ];
      let step = 0;
      const beat = 60 / 96 / 2; // 8th notes
      const playStep = () => {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const bar = Math.floor(step / 8) % 4;
        const chord = chords[bar];
        const inBar = step % 8;
        // Pad note on bar start.
        if (inBar === 0) {
          for (const f of chord) {
            const o = this.ctx.createOscillator(), g = this.ctx.createGain();
            o.type = this.radio === 3 ? 'square' : 'sawtooth';
            o.frequency.value = f;
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(0.05, t + 0.4);
            g.gain.linearRampToValueAtTime(0.0001, t + beat * 8);
            o.connect(g); g.connect(this.musicGain);
            o.start(t); o.stop(t + beat * 8 + 0.1);
          }
        }
        // Bass on beats 0,3,6.
        if (inBar === 0 || inBar === 3 || inBar === 6) {
          const o = this.ctx.createOscillator(), g = this.ctx.createGain();
          o.type = 'sine'; o.frequency.value = chord[0] / 2;
          g.gain.setValueAtTime(0.22, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + beat * 1.8);
          o.connect(g); g.connect(this.musicGain);
          o.start(t); o.stop(t + beat * 2);
        }
        // Hat on off-beats.
        if (inBar % 2 === 1) {
          const len = Math.floor(this.ctx.sampleRate * 0.03);
          const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
          const d = buf.getChannelData(0);
          for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
          const s = this.ctx.createBufferSource(); s.buffer = buf;
          const g = this.ctx.createGain(); g.gain.value = 0.06;
          s.connect(g); g.connect(this.musicGain); s.start(t);
        }
        step++;
      };
      this.musicTimer = setInterval(playStep, beat * 1000);
    },
    stopMusic() { if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; } },
    setRadio(i) { this.radio = i; this.radioSwitch(); },
  };
  return A;
}
