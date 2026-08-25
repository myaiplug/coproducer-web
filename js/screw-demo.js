const CATALOG_URL = new URL('../screwai/catalog.json', import.meta.url);

function fmt(t) {
  const s = Math.max(0, Math.floor(t || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

class ScrewDemo {
  constructor(root) {
    this.root = root;
    this.catalog = null;
    this.track = null;
    this.strain = null;
    this.buf = null;
    this.ctx = null;
    this.src = null;
    this.gain = null;
    this.playing = false;
    this.side = 'a';
    this.offset = 0;
    this.startedAt = 0;
    this.rate = 1;
    this.raf = 0;
  }

  async init() {
    const unlock = () => {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    };
    document.addEventListener('pointerdown', unlock);
    document.addEventListener('touchend', unlock);
    const res = await fetch(CATALOG_URL);
    this.catalog = await res.json();
    this.track = this.catalog.tracks[0];
    this.strain = this.catalog.strains[0];
    this.render();
    await this.loadTrack(this.track);
    this.selectStrain(this.strain.id);
  }

  render() {
    const product = this.catalog.product;
    this.root.innerHTML = `
      <div class="sx-shell">
        <img class="sx-logo" src="assets/products/screwai-logo.png" alt="ScrewAI — The Codeine Processor, chopped and screwed" loading="lazy"/>
        <p class="sx-kicker">NoDAW · ScrewAI</p>
        <h2 class="sx-title">ScrewAI <span>Syrup Lab</span></h2>
        <p class="sx-lede">${product.tagline} Pick a demo cut, flip the syrup bottles, A/B original vs screwed. Real product: drag audio onto the <strong>.bat</strong>, select multiple strains, render unlimited local files.</p>
        <div class="sx-tracks" data-tracks></div>
        <div class="sx-stage">
          <div class="sx-player">
            <h3 data-track-title></h3>
            <p class="sx-blurb" data-track-blurb></p>
            <div class="sx-transport">
              <button type="button" class="sx-play" data-play>Play</button>
              <div class="sx-ab">
                <button type="button" data-side="a" class="is-on"><span class="ab-label">A Original</span><span class="ab-desc">clean bounce</span></button>
                <button type="button" data-side="b"><span class="ab-label">B Syrup</span><span class="ab-desc">selected strain</span></button>
              </div>
            </div>
            <div class="sx-scrub" data-scrub><i data-fill></i></div>
            <p class="sx-time" data-time>0:00 / 0:00</p>
            <p class="sx-meta" data-strain-meta>Select a syrup bottle</p>
          </div>
          <div class="sx-rack-wrap">
            <div class="sx-rack-head"><span>Strain library</span><span>17 codeine flavors</span></div>
            <div class="sx-rack" data-strains></div>
          </div>
        </div>
        <div class="sx-foot">
          <p>Drag audio onto the ScrewAI <strong>.bat</strong>, tick as many bottles as you want, render. Unlimited local use — no cloud, no per-track fee.</p>
          <a class="sx-cta" href="${product.url}" target="_blank" rel="noopener">Open ScrewAI App</a>
        </div>
      </div>`;

    const tracksEl = this.root.querySelector('[data-tracks]');
    for (const t of this.catalog.tracks) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = t.title;
      b.dataset.track = t.id;
      b.addEventListener('click', () => this.pickTrack(t.id));
      tracksEl.append(b);
    }

    const strainsEl = this.root.querySelector('[data-strains]');
    this.catalog.strains.forEach((s, i) => {
      const fill = 42 + Math.round((1 - s.slowdown) * 55);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sx-vial';
      b.dataset.strain = s.id;
      b.style.setProperty('--strain-color', s.color);
      b.style.setProperty('--fill-base', `${fill}%`);
      b.style.setProperty('--fill-hover', `${Math.min(78, fill + 14)}%`);
      b.style.setProperty('--strip-order', String(i));
      b.title = `${s.name} · ${s.slowdown.toFixed(2)}×`;
      b.innerHTML = `<span class="sx-cap"><i></i></span><span class="sx-vial-name"></span>`;
      b.querySelector('.sx-vial-name').textContent = s.name;
      b.addEventListener('click', () => this.selectStrain(s.id));
      strainsEl.append(b);
    });

    this.root.querySelector('[data-play]').addEventListener('click', () => {
      if (this.playing) this.pause();
      else this.play();
    });
    this.root.querySelectorAll('[data-side]').forEach((btn) => {
      btn.addEventListener('click', () => this.setSide(btn.dataset.side));
    });
    this.root.querySelector('[data-scrub]').addEventListener('click', (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      this.seek(p * this.duration());
    });
  }

  paintChrome() {
    this.root.querySelectorAll('[data-tracks] button').forEach((b) => {
      b.classList.toggle('is-on', b.dataset.track === this.track.id);
    });
    this.root.querySelectorAll('[data-strains] .sx-vial').forEach((b) => {
      b.classList.toggle('is-on', b.dataset.strain === this.strain.id);
    });
    this.root.querySelector('[data-track-title]').textContent = this.track.title;
    this.root.querySelector('[data-track-blurb]').textContent = this.track.blurb || '';
    this.root.querySelector('[data-strain-meta]').textContent =
      `${this.strain.name} · ${this.strain.slowdown.toFixed(2)}× · ${this.side === 'a' ? 'Original' : 'Syrup strain'}`;
    this.root.querySelectorAll('[data-side]').forEach((b) => {
      b.classList.toggle('is-on', b.dataset.side === this.side);
    });
    const play = this.root.querySelector('[data-play]');
    if (play) play.textContent = this.playing ? 'Pause' : 'Play';
  }

  async pickTrack(id) {
    const next = this.catalog.tracks.find((t) => t.id === id);
    if (!next) return;
    const was = this.playing;
    this.pause();
    this.offset = 0;
    await this.loadTrack(next);
    this.paintChrome();
    if (was) this.play();
  }

  selectStrain(id) {
    const next = this.catalog.strains.find((s) => s.id === id);
    if (!next) return;
    const pos = this.progress();
    this.strain = next;
    if (this.side === 'b') {
      this.rate = next.slowdown;
      if (this.playing) {
        this.pause();
        this.offset = pos * this.duration();
        this.play();
      }
    }
    this.paintChrome();
  }

  setSide(side) {
    if (side !== 'a' && side !== 'b') return;
    const pos = this.progress();
    this.side = side;
    this.rate = side === 'a' ? 1 : this.strain.slowdown;
    if (this.playing) {
      this.pause();
      this.offset = pos * this.duration();
      this.play();
    } else {
      this.offset = pos * this.duration();
    }
    this.paintChrome();
    this.tick(false);
  }

  async loadTrack(track) {
    this.track = track;
    const url = new URL(track.file, CATALOG_URL);
    const res = await fetch(url);
    const raw = await res.arrayBuffer();
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.buf = await this.ctx.decodeAudioData(raw.slice(0));
    this.offset = 0;
    this.paintChrome();
    this.tick(false);
  }

  duration() {
    if (!this.buf) return 0;
    return this.buf.duration / (this.rate || 1);
  }

  now() {
    if (!this.playing || !this.ctx) return this.offset;
    return Math.min(this.duration(), Math.max(0, this.ctx.currentTime - this.startedAt));
  }

  progress() {
    const d = this.duration();
    return d ? this.now() / d : 0;
  }

  async play() {
    if (!this.buf) return;
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state !== 'running') {
      try { await this.ctx.resume(); } catch { /* ignored */ }
      if (this.ctx.state !== 'running') {
        try { await this.ctx.close(); } catch { /* ignored */ }
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.gain = null;
      }
    }
    this.stopSource();
    if (!this.gain) {
      this.gain = this.ctx.createGain();
      this.gain.connect(this.ctx.destination);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = this.buf;
    src.playbackRate.value = this.rate;
    src.connect(this.gain);
    const startAt = Math.min(this.buf.duration - 0.01, this.offset * this.rate);
    src.start(0, Math.max(0, startAt));
    this.src = src;
    this.startedAt = this.ctx.currentTime - this.offset;
    this.playing = true;
    this.paintChrome();
    this.arm();
  }

  pause() {
    if (!this.playing) return;
    this.offset = this.now();
    this.stopSource();
    this.playing = false;
    this.paintChrome();
    this.tick(false);
  }

  seek(seconds) {
    const was = this.playing;
    this.pause();
    this.offset = Math.max(0, Math.min(seconds || 0, this.duration()));
    this.tick(false);
    if (was) this.play();
  }

  stopSource() {
    try { this.src?.stop(); } catch { /* */ }
    this.src = null;
    cancelAnimationFrame(this.raf);
  }

  arm() {
    cancelAnimationFrame(this.raf);
    const loop = () => {
      this.tick(true);
      if (this.playing) {
        if (this.now() >= this.duration() - 0.02) {
          this.pause();
          this.offset = 0;
          this.tick(false);
          return;
        }
        this.raf = requestAnimationFrame(loop);
      }
    };
    this.raf = requestAnimationFrame(loop);
  }

  tick() {
    const t = this.now();
    const d = this.duration();
    const fill = this.root.querySelector('[data-fill]');
    const time = this.root.querySelector('[data-time]');
    if (fill) fill.style.width = `${d ? (t / d) * 100 : 0}%`;
    if (time) time.textContent = `${fmt(t)} / ${fmt(d)}`;
  }
}

async function mountAll() {
  const nodes = document.querySelectorAll('[data-screw-demo]');
  for (const el of nodes) {
    const demo = new ScrewDemo(el);
    try {
      await demo.init();
    } catch (err) {
      el.innerHTML = `<div class="sx-shell"><p class="sx-lede">ScrewAI demo failed to load (${err.message || err}).</p></div>`;
    }
  }
}

mountAll();
