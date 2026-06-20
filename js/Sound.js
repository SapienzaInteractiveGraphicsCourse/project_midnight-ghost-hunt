// Sound.js: off by default, toggled in settings.

export class Sound {
  constructor() {
    this.enabled = false;
    this.ctx = null;
  }
  _ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }
  setEnabled(on) { this.enabled = on; if (on) this._ensure(); }

  _tone(freq, dur, type = 'sine', gain = 0.12, slideTo = null) {
    if (!this.enabled) return;
    this._ensure();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(this.ctx.destination);
    osc.start(t); osc.stop(t + dur);
  }

  shoot() { this._tone(880, 0.18, 'triangle', 0.1, 220); }
  kill() { this._tone(140, 0.4, 'sawtooth', 0.14, 60); this._tone(520, 0.3, 'sine', 0.08, 1200); }
  hurt() { this._tone(90, 0.35, 'square', 0.16, 40); }
  empty() { this._tone(160, 0.08, 'square', 0.06); }
  pickup() { this._tone(660, 0.12, 'sine', 0.1, 1320); }

  thunder() {
    if (!this.enabled) return;
    this._ensure();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._tone(70, 1.4, 'sawtooth', 0.12, 38);
    this._tone(48, 1.6, 'sine', 0.10, 30);
    const dur = 0.9;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1200;
    src.connect(lp); lp.connect(g); g.connect(this.ctx.destination);
    src.start(t); src.stop(t + dur);
  }
}
