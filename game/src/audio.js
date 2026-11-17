// audio.js — All sound in NEON BAY is synthesized live with WebAudio.
// No audio files: engine hum, sirens, gunshots, cash chimes and a synthwave
// bass loop are built from oscillators and filtered noise.
export class AudioEngine {
  constructor() {
    this.context = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.muted = false;
    this.musicTimer = null;
    this.musicStep = 0;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenOn = false;
    this.nextNoteTime = 0;
  }

  // Browsers only allow audio after a user gesture; call from the Start button.
  ensure() {
    if (this.context) {
      if (this.context.state === 'suspended') this.context.resume();
      return;
    }
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    this.context = new Ctor();
    this.master = this.context.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.context.destination);
    this.musicGain = this.context.createGain();
    this.musicGain.gain.value = 0.16;
    this.musicGain.connect(this.master);
    this.sfxGain = this.context.createGain();
    this.sfxGain.gain.value = 0.9;
    this.sfxGain.connect(this.master);
    this.startEngineHum();
    this.startMusic();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.55;
    return this.muted;
  }

  now() {
    return this.context ? this.context.currentTime : 0;
  }

  tone(freq, duration, type, volume, when, slideTo) {
    if (!this.context) return;
    const t = when || this.now();
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + duration);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  noiseBurst(duration, volume, filterFreq, when) {
    if (!this.context) return;
    const t = when || this.now();
    const length = Math.max(1, Math.floor(this.context.sampleRate * duration));
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq || 1800;
    const gain = this.context.createGain();
    gain.gain.value = volume;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    source.start(t);
  }

  // --- one-shot effects -------------------------------------------------
  shoot() {
    this.noiseBurst(0.14, 0.5, 3200);
    this.tone(190, 0.09, 'square', 0.22, 0, 70);
  }
  punch() {
    this.noiseBurst(0.09, 0.4, 500);
    this.tone(120, 0.08, 'sine', 0.35, 0, 55);
  }
  crash(intensity) {
    this.noiseBurst(0.28, Math.min(0.7, 0.25 + intensity * 0.4), 900);
    this.tone(90, 0.2, 'sawtooth', 0.25, 0, 40);
  }
  explosion() {
    this.noiseBurst(0.7, 0.8, 700);
    this.tone(60, 0.6, 'sine', 0.6, 0, 28);
  }
  pickup() {
    this.tone(880, 0.1, 'sine', 0.3);
    this.tone(1318, 0.16, 'sine', 0.3, this.now() + 0.08);
  }
  cash() {
    [1046, 1318, 1568, 2093].forEach((freq, i) => {
      this.tone(freq, 0.14, 'triangle', 0.28, this.now() + i * 0.07);
    });
  }
  click() {
    this.tone(1200, 0.05, 'square', 0.15);
  }
  honk() {
    this.tone(370, 0.18, 'square', 0.18);
    this.tone(466, 0.18, 'square', 0.14);
  }
  missionWin() {
    [523, 659, 784, 1046, 1318].forEach((freq, i) => {
      this.tone(freq, 0.22, 'triangle', 0.3, this.now() + i * 0.1);
    });
  }
  missionFail() {
    [392, 330, 262, 196].forEach((freq, i) => {
      this.tone(freq, 0.3, 'sawtooth', 0.18, this.now() + i * 0.13);
    });
  }
  busted() {
    [220, 175, 147, 110].forEach((freq, i) => {
      this.tone(freq, 0.4, 'sawtooth', 0.22, this.now() + i * 0.18);
    });
  }
  sirenBlip() {
    this.tone(950, 0.16, 'sine', 0.12, 0, 1400);
  }

  // --- continuous engine hum -------------------------------------------
  startEngineHum() {
    this.engineOsc = this.context.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineFilter = this.context.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 320;
    this.engineGain = this.context.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
  }

  // speedRatio 0..1, onFoot true silences the engine.
  updateEngine(speedRatio, onFoot) {
    if (!this.context || !this.engineGain) return;
    const target = onFoot ? 0 : 0.02 + speedRatio * 0.075;
    this.engineGain.gain.setTargetAtTime(target, this.now(), 0.08);
    this.engineOsc.frequency.setTargetAtTime(52 + speedRatio * 165, this.now(), 0.06);
    this.engineFilter.frequency.setTargetAtTime(300 + speedRatio * 1400, this.now(), 0.1);
  }

  // --- police siren loop -------------------------------------------------
  setSiren(on) {
    if (!this.context) return;
    if (on === this.sirenOn) return;
    this.sirenOn = on;
    if (on) {
      this.sirenOsc = this.context.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenOsc.frequency.value = 750;
      const lfo = this.context.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = 1.4;
      const lfoGain = this.context.createGain();
      lfoGain.gain.value = 320;
      lfo.connect(lfoGain);
      lfoGain.connect(this.sirenOsc.frequency);
      this.sirenGain = this.context.createGain();
      this.sirenGain.gain.value = 0.05;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      lfo.start();
      this.sirenLfo = lfo;
    } else if (this.sirenOsc) {
      try { this.sirenOsc.stop(); } catch (e) { /* already stopped */ }
      try { this.sirenLfo.stop(); } catch (e) { /* already stopped */ }
      this.sirenOsc = null;
      this.sirenLfo = null;
    }
  }

  // --- synthwave music loop ---------------------------------------------
  // Am – F – C – G, one bar each; bass eighth notes, soft pad, sparse hats.
  startMusic() {
    if (this.musicTimer) return;
    const chords = [
      [110.0, 130.81, 164.81, 220.0], // Am
      [87.31, 130.81, 174.61, 220.0], // F
      [130.81, 164.81, 196.0, 261.63], // C
      [98.0, 146.83, 196.0, 246.94], // G
    ];
    const bassNotes = [55, 43.65, 65.41, 49];
    const stepDur = 0.21;
    this.nextNoteTime = this.now() + 0.1;
    this.musicTimer = setInterval(() => {
      if (!this.context) return;
      while (this.nextNoteTime < this.now() + 0.35) {
        const step = this.musicStep;
        const bar = Math.floor(step / 8) % 4;
        const t = this.nextNoteTime;
        // Bass on every eighth note.
        this.musicTone(bassNotes[bar] * (step % 4 === 3 ? 1.5 : 1), stepDur * 0.9, 'sawtooth', 0.5, t);
        // Pad chord at the top of each bar.
        if (step % 8 === 0) {
          chords[bar].forEach((freq) => this.musicTone(freq, stepDur * 8, 'triangle', 0.12, t));
        }
        // Hat tick on off-beats.
        if (step % 2 === 1) this.musicNoise(0.03, 0.1, 6000, t);
        // Sparkle lead every other bar.
        if (step % 16 === 10) this.musicTone(chords[bar][3] * 2, stepDur * 2, 'sine', 0.14, t);
        this.musicStep++;
        this.nextNoteTime += stepDur;
      }
    }, 90);
  }

  musicTone(freq, duration, type, volume, when) {
    const t = when;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain);
    gain.connect(this.musicGain);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  musicNoise(duration, volume, filterFreq, when) {
    const length = Math.max(1, Math.floor(this.context.sampleRate * duration));
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    const filter = this.context.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = filterFreq;
    const gain = this.context.createGain();
    gain.gain.value = volume;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);
    source.start(when);
  }
}
