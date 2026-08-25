import {
  equalPowerGains,
  formatTime,
  offsetFromClick,
  lookaheadWindow,
  colorForCentroidHz,
} from './player-math.js';

const WIN = typeof window !== 'undefined' ? window : undefined;
const AB_S = 0.008;
const SEEK_S = 0.005;

function mixHex(a, b, p) {
  const n = (h, i) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  const ch = (i) => Math.round(n(a, i) + (n(b, i) - n(a, i)) * p);
  return `rgb(${ch(0)},${ch(1)},${ch(2)})`;
}

function colorForAmp(v, hf, theme) {
  const a = Math.abs(v);
  if (a > 0.99) return '#ef4444';
  const lush = theme === 'home' || theme === 'journal';
  if (hf != null && Number.isFinite(hf)) {
    const hz = 80 + hf * 9000;
    if (theme === 'journal') {
      if (hz < 400) return '#c4a574';
      if (hz < 4000) return '#e84cff';
      return '#c9ff4d';
    }
    if (theme === 'home') {
      if (hz < 400) return '#a839ff';
      if (hz < 4000) return '#e84cff';
      return '#c9ff4d';
    }
    return colorForCentroidHz(hz);
  }
  const p = Math.min(1, a);
  if (theme === 'journal') return mixHex('#c4a574', '#e84cff', p);
  return lush ? mixHex('#a839ff', '#e84cff', p) : mixHex('#22d3ee', '#10b981', p);
}

export class CoproducerPlayer {
  constructor(root, { mode = 'ab', theme = '' } = {}) {
    this.root = root;
    this.theme = theme === 'home' || theme === 'journal' ? theme : '';
    this.mode = mode === 'single' ? 'single' : 'ab';
    this.side = 'a';
    this.offset = 0;
    this.startedAt = 0;
    this.playing = false;
    this.wantPlay = false;
    this.gen = 0;
    this.bufA = this.bufB = null;
    this.peaksA = this.peaksB = this.hfA = this.hfB = null;
    this.ctx = this.gainA = this.gainB = this.srcA = this.srcB = null;
    this.raf = 0;
    this.canvas = root.querySelector('.cp-wave');
    this.playBtn = root.querySelector('.cp-play');
    this.timeEl = root.querySelector('.cp-time');
    this.abEl = root.querySelector('.cp-ab');
    if (this.abEl) this.abEl.hidden = this.mode !== 'ab';
    this.playBtn?.addEventListener('click', () => (this.playing ? this.pause() : this.play()));
    this.abEl?.querySelectorAll('[data-side]').forEach((btn) => {
      btn.addEventListener('click', () => this.setSide(btn.dataset.side));
    });
    this._bindSeek();
    this._syncUi();
    this._unlock = () => {
      this._ensureCtx();
      if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    };
    if (WIN) {
      WIN.addEventListener('pointerdown', this._unlock);
      WIN.addEventListener('touchend', this._unlock);
    }
  }

  async load({ a, b, peaksA, peaksB } = {}) {
    this.pause();
    this.bufA = this.bufB = null;
    this.peaksA = this.peaksB = this.hfA = this.hfB = null;
    this.offset = 0;
    if (this.playBtn) this.playBtn.disabled = true;
    this._draw();
    this._syncUi();
    this._ensureCtx();
    this.bufA = await this._decode(a);
    this.bufB = b != null ? await this._decode(b) : null;
    const envA = peaksA ? { peaks: peaksA, hf: null } : this._envelope(this.bufA);
    this.peaksA = envA.peaks;
    this.hfA = envA.hf;
    if (this.bufB) {
      const envB = peaksB ? { peaks: peaksB, hf: null } : this._envelope(this.bufB);
      this.peaksB = envB.peaks;
      this.hfB = envB.hf;
    } else this.peaksB = this.hfB = null;
    this.offset = 0;
    this._applyGains();
    this._draw();
    this._syncUi();
  }

  play() {
    if (!this.bufA || this.playing) return;
    this.wantPlay = true;
    const start = () => {
      if (!this.wantPlay || this.playing || !this.bufA) return;
      if (this.offset >= this._duration()) this.offset = 0;
      this._startSources(false);
      this._armRaf();
      this._syncUi();
    };
    const ensureRunning = async () => {
      this._ensureCtx();
      if (this.ctx.state !== 'running') {
        try { await this.ctx.resume(); } catch { /* ignored */ }
      }
      if (this.ctx.state !== 'running' && WIN) {
        try { await this.ctx.close(); } catch { /* ignored */ }
        const AC = WIN.AudioContext || WIN.webkitAudioContext;
        this.ctx = new AC();
        this.gainA = this.ctx.createGain();
        this.gainB = this.ctx.createGain();
        this.gainA.connect(this.ctx.destination);
        this.gainB.connect(this.ctx.destination);
        this._applyGains();
      }
      start();
    };
    ensureRunning();
  }

  pause() {
    this.wantPlay = false;
    if (!this.playing) return;
    this.offset = this.getTime();
    this._halt();
    this._syncUi();
    this._draw();
  }

  seek(seconds) {
    const dur = this._duration();
    this.offset = Math.max(0, Math.min(seconds || 0, dur));
    const keep = this.playing && this.offset < dur;
    this._halt();
    if (keep) {
      this.wantPlay = true;
      this._startSources(true);
      this._armRaf();
    }
    this._syncUi();
    this._draw();
  }

  setSide(side) {
    if (this.mode !== 'ab' || (side !== 'a' && side !== 'b') || side === this.side) return;
    const from = equalPowerGains(this.side === 'b' ? 1 : 0);
    this.side = side;
    const to = equalPowerGains(side === 'b' ? 1 : 0);
    if (this.gainA) {
      const t = this.ctx.currentTime;
      this.gainA.gain.cancelScheduledValues(t);
      this.gainB.gain.cancelScheduledValues(t);
      this.gainA.gain.setValueAtTime(from.a, t);
      this.gainB.gain.setValueAtTime(from.b, t);
      this.gainA.gain.linearRampToValueAtTime(to.a, t + AB_S);
      this.gainB.gain.linearRampToValueAtTime(to.b, t + AB_S);
    }
    this._syncUi();
    this._draw();
  }

  getSide() { return this.side; }

  getTime() {
    if (!this.playing || !this.ctx) return this.offset;
    return Math.min(this._duration(), Math.max(0, this.ctx.currentTime - this.startedAt));
  }

  _ensureCtx() {
    if (this.ctx || !WIN) return;
    const AC = WIN.AudioContext || WIN.webkitAudioContext;
    this.ctx = new AC();
    this.gainA = this.ctx.createGain();
    this.gainB = this.ctx.createGain();
    this.gainA.connect(this.ctx.destination);
    this.gainB.connect(this.ctx.destination);
    this._applyGains();
  }

  async _decode(src) {
    if (typeof AudioBuffer !== 'undefined' && src instanceof AudioBuffer) return src;
    let bytes;
    if ((typeof File !== 'undefined' && src instanceof File) || (typeof Blob !== 'undefined' && src instanceof Blob)) {
      bytes = await src.arrayBuffer();
    } else if (typeof src === 'string') {
      bytes = await (await fetch(src)).arrayBuffer();
    } else {
      bytes = await src.arrayBuffer();
    }
    return this.ctx.decodeAudioData(bytes.slice(0));
  }

  _duration() { return this.bufA ? this.bufA.duration : 0; }

  _applyGains() {
    if (!this.gainA) return;
    const g = equalPowerGains(this.side === 'b' ? 1 : 0);
    const t = this.ctx.currentTime;
    this.gainA.gain.setValueAtTime(g.a, t);
    this.gainB.gain.setValueAtTime(g.b, t);
  }

  _makeSrc(buf, gain, gen) {
    if (!buf) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(gain);
    src.start(0, this.offset);
    src.onended = () => { if (this.gen === gen && this.playing) this._ended(); };
    return src;
  }

  _startSources(fade) {
    const gen = ++this.gen;
    this.srcA = this._makeSrc(this.bufA, this.gainA, gen);
    this.srcB = this.mode === 'ab' ? this._makeSrc(this.bufB, this.gainB, gen) : null;
    this.startedAt = this.ctx.currentTime - this.offset;
    this.playing = true;
    if (fade) {
      const g = equalPowerGains(this.side === 'b' ? 1 : 0);
      const t = this.ctx.currentTime;
      this.gainA.gain.cancelScheduledValues(t);
      this.gainB.gain.cancelScheduledValues(t);
      this.gainA.gain.setValueAtTime(0, t);
      this.gainB.gain.setValueAtTime(0, t);
      this.gainA.gain.linearRampToValueAtTime(g.a, t + SEEK_S);
      this.gainB.gain.linearRampToValueAtTime(g.b, t + SEEK_S);
    } else this._applyGains();
  }

  _halt() {
    this.gen++;
    this.playing = false;
    if (this.raf && WIN) WIN.cancelAnimationFrame(this.raf);
    this.raf = 0;
    for (const s of [this.srcA, this.srcB]) {
      if (!s) continue;
      s.onended = null;
      try { s.stop(); } catch { /* already stopped */ }
    }
    this.srcA = this.srcB = null;
  }

  _ended() {
    this.offset = this._duration();
    this.wantPlay = false;
    this._halt();
    this._syncUi();
    this._draw();
  }

  _armRaf() {
    if (!WIN) return;
    if (this.raf) WIN.cancelAnimationFrame(this.raf);
    this.raf = WIN.requestAnimationFrame(this._tick);
  }

  _tick = () => {
    if (!this.playing) return;
    if (this.getTime() >= this._duration()) { this._ended(); return; }
    this._syncUi();
    this._draw();
    if (WIN) this.raf = WIN.requestAnimationFrame(this._tick);
  };

  _bindSeek() {
    const c = this.canvas;
    if (!c) return;
    let drag = false;
    const go = (e) => this.seek(offsetFromClick(e.offsetX, c.clientWidth, this._duration()));
    c.addEventListener('pointerdown', (e) => {
      drag = true;
      c.setPointerCapture(e.pointerId);
      go(e);
    });
    c.addEventListener('pointermove', (e) => { if (drag) go(e); });
    const up = () => { drag = false; };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
  }

  _envelope(buf) {
    const n = (this.canvas && this.canvas.width) || 1200;
    const ch0 = buf.getChannelData(0);
    const ch1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : ch0;
    const peaks = new Array(n);
    const hf = new Array(n);
    const len = buf.length;
    for (let i = 0; i < n; i++) {
      const a0 = ((i * len) / n) | 0;
      const a1 = (((i + 1) * len) / n) | 0;
      const step = Math.max(1, ((a1 - a0) / 48) | 0);
      let peak = 0, e = 0, h = 0, prev = 0;
      for (let s = a0; s < a1; s += step) {
        const mid = (ch0[s] + ch1[s]) * 0.5;
        const abs = mid < 0 ? -mid : mid;
        if (abs > peak) peak = abs;
        e += abs * abs;
        const d = mid - prev;
        h += d * d;
        prev = mid;
      }
      peaks[i] = peak;
      hf[i] = h / (e + h + 1e-12);
    }
    return { peaks, hf };
  }

  _syncUi() {
    if (this.timeEl) this.timeEl.textContent = formatTime(this.getTime());
    if (this.playBtn) {
      this.playBtn.textContent = this.playing ? 'Pause' : 'Play';
      this.playBtn.disabled = !this.bufA;
    }
    this.abEl?.querySelectorAll('[data-side]').forEach((btn) => {
      btn.classList.toggle('is-live', btn.dataset.side === this.side);
    });
  }

  _sizeCanvas() {
    const c = this.canvas;
    if (!c || !WIN) return;
    const dpr = Math.min(2, WIN.devicePixelRatio || 1);
    const cssW = Math.max(1, Math.floor(c.clientWidth || c.width || 640));
    const cssH = Math.max(1, Math.floor(c.clientHeight || c.height || 80));
    const tw = Math.floor(cssW * dpr);
    const th = Math.floor(cssH * dpr);
    if (c.width !== tw || c.height !== th) {
      c.width = tw;
      c.height = th;
    }
  }

  _draw() {
    const c = this.canvas;
    if (!c) return;
    this._sizeCanvas();
    const g = c.getContext('2d');
    const w = c.width;
    const h = c.height;
    g.clearRect(0, 0, w, h);
    g.fillStyle = this.theme === 'journal' ? '#100c12' : this.theme === 'home' ? '#07050a' : '#070b11';
    g.fillRect(0, 0, w, h);
    const liveB = this.mode === 'ab' && this.side === 'b' && this.peaksB;
    const peaks = liveB ? this.peaksB : this.peaksA;
    const hf = liveB ? this.hfB : this.hfA;
    if (peaks && peaks.length) {
      const mid = h / 2;
      const lush = this.theme === 'journal' || this.theme === 'home';
      if (lush) {
        const bars = this.theme === 'journal' ? Math.min(48, peaks.length) : Math.min(72, peaks.length);
        const gap = Math.max(2, Math.floor(w / (bars * 8)));
        const bw = Math.max(3, (w - gap * (bars - 1)) / bars);
        for (let i = 0; i < bars; i++) {
          const idx = Math.floor((i / bars) * peaks.length);
          const amp = Math.abs(peaks[idx]);
          const bh = Math.max(h * 0.08, amp * h * 0.42);
          const x = i * (bw + gap);
          g.fillStyle = colorForAmp(peaks[idx], hf ? hf[idx] : null, this.theme);
          g.globalAlpha = 0.95;
          g.fillRect(x, mid - bh, bw, bh * 2);
        }
        g.globalAlpha = 1;
      } else {
        const n = peaks.length;
        const bw = w / n;
        for (let i = 0; i < n; i++) {
          const bh = Math.abs(peaks[i]) * (h * 0.46);
          g.fillStyle = colorForAmp(peaks[i], hf ? hf[i] : null, this.theme);
          g.fillRect(i * bw, mid - bh, Math.max(1, bw), bh * 2);
        }
      }
    }
    const dur = this._duration();
    if (dur > 0) {
      const t = this.getTime();
      const win = lookaheadWindow(t, dur, 3);
      g.fillStyle = this.theme === 'journal' || this.theme === 'home' ? 'rgba(232,76,255,0.14)' : 'rgba(255,255,255,0.35)';
      g.fillRect((win.start / dur) * w, 0, ((win.end - win.start) / dur) * w, h);
      g.fillStyle = this.theme === 'journal' || this.theme === 'home' ? '#e84cff' : '#e2e8f0';
      g.fillRect((t / dur) * w, 0, 1, h);
    }
  }
}
