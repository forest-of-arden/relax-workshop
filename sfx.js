/* WebAudio 合成音效：无需任何音频素材（经典脚本版本） */
class SFX {
  constructor() {
    this.enabled = true;
    this.ctx = null;
    this.master = null;
    this._noise = null;
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.45;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this._noise = buf;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  _ok() { return this.enabled && this.ctx; }

  tone({ f0 = 440, f1 = null, dur = 0.1, type = 'sine', vol = 0.4, delay = 0 } = {}) {
    if (!this._ok()) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 !== null) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  noise({ dur = 0.12, vol = 0.25, freq = 2000, type = 'lowpass', q = 1, delay = 0 } = {}) {
    if (!this._ok()) return;
    const t0 = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource();
    s.buffer = this._noise;
    s.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t0);
    s.stop(t0 + dur + 0.05);
  }

  pop() {
    this.tone({ f0: 480 + Math.random() * 220, f1: 110, dur: 0.09, vol: 0.5 });
    this.noise({ dur: 0.03, vol: 0.12, freq: 5000, type: 'highpass' });
  }
  scrape() { this.noise({ dur: 0.13, vol: 0.16, freq: 1600 + Math.random() * 700, type: 'bandpass', q: 0.8 }); }
  sizzle() { this.noise({ dur: 0.3, vol: 0.14, freq: 5000, type: 'bandpass', q: 0.6 }); }
  crunch() {
    this.noise({ dur: 0.16, vol: 0.32, freq: 850 });
    this.tone({ f0: 170, f1: 55, dur: 0.13, type: 'triangle', vol: 0.3 });
  }
  squish() {
    this.tone({ f0: 280, f1: 65, dur: 0.2, vol: 0.35 });
    this.noise({ dur: 0.1, vol: 0.1, freq: 500 });
  }
  slice() {
    this.noise({ dur: 0.15, vol: 0.18, freq: 2400, type: 'bandpass', q: 1.5 });
    this.tone({ f0: 900, f1: 300, dur: 0.08, type: 'triangle', vol: 0.12 });
  }
  whirr() { this.tone({ f0: 130 + Math.random() * 40, f1: 110, dur: 0.06, type: 'sawtooth', vol: 0.045 }); }
  chime() {
    this.tone({ f0: 784, dur: 0.3, vol: 0.25 });
    this.tone({ f0: 1046, dur: 0.35, vol: 0.25, delay: 0.12 });
    this.tone({ f0: 1568, dur: 0.55, vol: 0.18, delay: 0.24 });
  }
}
