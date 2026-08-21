import { CoproducerPlayer } from '../../js/player.js';

const DEMO = new URL('../../demo/', import.meta.url);
const CATALOG = new URL('../stems/catalog.json', import.meta.url);

function gate(metric, v) {
  if (v === null || v === undefined || v === '') return '';
  const m = String(metric).toLowerCase();
  if (m === 'rating') return String(v).toLowerCase().includes('release ready') ? 'good' : 'bad';
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  if (m === 'score') return n >= 90 ? 'good' : 'bad';
  if (m.includes('lufs')) return Math.abs(n - (-14)) <= 1.5 ? 'good' : 'bad';
  if (m.includes('true peak')) return n <= -1 + 0.15 ? 'good' : 'bad';
  if (m.includes('clipped')) return n === 0 ? 'good' : 'bad';
  return '';
}

function cell(v) {
  if (v === null || v === undefined || v === '') return '—';
  return String(v);
}

async function loadTracks() {
  try {
    const res = await fetch(new URL('tracks.json', DEMO));
    if (!res.ok) throw new Error('no catalog');
    const data = await res.json();
    return data.tracks || [];
  } catch {
    return [];
  }
}

function pickTrack(tracks, id) {
  if (id && id !== 'random') return tracks.find((t) => t.id === id) || tracks[0];
  return tracks[Math.floor(Math.random() * tracks.length)] || tracks[0];
}

function reportRows(track) {
  const want = ['Score', 'Integrated LUFS', 'True peak dBTP', 'Clipped samples', 'Rating'];
  return (track.rows || []).filter((r) => want.includes(r.metric));
}

function emitPlay() {
  document.dispatchEvent(new CustomEvent('lacquer-audio-play', { detail: { src: 'ab' } }));
}

async function mountAb(el, tracks) {
  const track = pickTrack(tracks, el.dataset.ab);
  if (!track) {
    el.hidden = true;
    return;
  }
  const showReport = el.hasAttribute('data-report');
  el.classList.add('jx-card');
  el.innerHTML = `
    <p class="jx-kicker">CoProducer · A/B</p>
    <h3>${track.title} · ${track.before?.score ?? ''} → ${track.after?.score ?? ''}</h3>
    <p class="jx-story">${track.problem || ''}</p>
    <div class="cp-player jx-player" data-mode="ab">
      <canvas class="cp-wave" width="720" height="56"></canvas>
      <div class="cp-transport">
        <button type="button" class="cp-play">Play</button>
        <span class="cp-time">0:00</span>
        <div class="cp-ab">
          <button type="button" data-side="a" class="is-live">A Before</button>
          <button type="button" data-side="b">B Repaired</button>
        </div>
      </div>
    </div>
    ${showReport ? `<div class="table-scroll"><table class="jx-table"><thead><tr><th>Metric</th><th>Before</th><th>After</th></tr></thead><tbody></tbody></table></div>` : ''}
    <p class="jx-foot"><a href="../index.html#ab">Full A/B on the homepage</a></p>`;
  if (showReport) {
    const tb = el.querySelector('tbody');
    for (const row of reportRows(track)) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td></td><td class="${gate(row.metric, row.before)}"></td><td class="${gate(row.metric, row.after)}"></td>`;
      tr.cells[0].textContent = row.metric;
      tr.cells[1].textContent = cell(row.before);
      tr.cells[2].textContent = cell(row.after);
      tb.append(tr);
    }
  }
  const host = el.querySelector('.jx-player');
  const player = new CoproducerPlayer(host, { mode: 'ab', theme: 'journal' });
  const origPlay = player.play.bind(player);
  player.play = () => { emitPlay(); origPlay(); };
  document.addEventListener('lacquer-audio-play', (e) => {
    if (e.detail?.src !== 'ab') player.pause();
  });
  try {
    await player.load({
      a: new URL(track.beforeFile, DEMO).href,
      b: new URL(track.afterFile, DEMO).href,
    });
  } catch (err) {
    const story = el.querySelector('.jx-story');
    if (story) story.textContent = 'Audio could not load. Serve the site over http.';
  }
}

async function loadStemCatalog() {
  const res = await fetch(CATALOG);
  if (!res.ok) throw new Error('no stems');
  const data = await res.json();
  return data.tracks || [];
}

function stemUrl(track, file) {
  const base = track.base || '';
  if (/^https?:/i.test(base)) return base.replace(/\/?$/, '/') + file;
  return new URL(base + file, CATALOG).href;
}

class StemDeck {
  constructor(root, track) {
    this.root = root;
    this.track = track;
    this.ctx = null;
    this.buffers = {};
    this.gains = {};
    this.sources = {};
    this.mute = {};
    this.solo = {};
    this.startedAt = 0;
    this.offset = 0;
    this.playing = false;
    this.loaded = false;
    this.raf = 0;
    track.stems.forEach((s) => { this.mute[s.id] = false; this.solo[s.id] = false; });
  }

  _ctx() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    return this.ctx;
  }

  async ensure() {
    if (this.loaded) return;
    const ctx = this._ctx();
    await Promise.all(this.track.stems.map(async (s) => {
      const res = await fetch(stemUrl(this.track, s.file));
      const raw = await res.arrayBuffer();
      this.buffers[s.id] = await ctx.decodeAudioData(raw.slice(0));
    }));
    this.loaded = true;
    this._paintProgress();
  }

  duration() {
    const first = this.track.stems.map((s) => this.buffers[s.id]).find(Boolean);
    return first ? first.duration : 0;
  }

  _audible(id) {
    const anySolo = this.track.stems.some((s) => this.solo[s.id]);
    if (anySolo) return this.solo[id] && !this.mute[id];
    return !this.mute[id];
  }

  _halt() {
    for (const s of this.track.stems) {
      try { this.sources[s.id]?.stop(); } catch { /* already stopped */ }
      this.sources[s.id] = null;
    }
    this.playing = false;
  }

  _start() {
    const ctx = this._ctx();
    const t = ctx.currentTime;
    const off = this.offset;
    for (const s of this.track.stems) {
      const buf = this.buffers[s.id];
      if (!buf) continue;
      if (!this.gains[s.id]) {
        const g = ctx.createGain();
        g.connect(ctx.destination);
        this.gains[s.id] = g;
      }
      this.gains[s.id].gain.setValueAtTime(this._audible(s.id) ? 1 : 0, t);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.gains[s.id]);
      src.start(t, off);
      this.sources[s.id] = src;
    }
    this.startedAt = t - off;
    this.playing = true;
    cancelAnimationFrame(this.raf);
    this._paintProgress();
  }

  apply() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const s of this.track.stems) {
      if (this.gains[s.id]) this.gains[s.id].gain.setValueAtTime(this._audible(s.id) ? 1 : 0, t);
    }
    this._paintButtons();
  }

  async play() {
    document.dispatchEvent(new CustomEvent('lacquer-audio-play', { detail: { src: 'stems' } }));
    await this.ensure();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    if (this.offset >= this.duration()) this.offset = 0;
    this._halt();
    this._start();
    this._paintButtons();
  }

  pause() {
    if (!this.playing) return;
    this.offset = Math.min(this.duration(), Math.max(0, this.ctx.currentTime - this.startedAt));
    this._halt();
    cancelAnimationFrame(this.raf);
    this._paintButtons();
    this._paintProgress();
  }

  toggleMute(id) { this.mute[id] = !this.mute[id]; this.apply(); }
  toggleSolo(id) { this.solo[id] = !this.solo[id]; this.apply(); }

  _time() {
    if (!this.playing || !this.ctx) return this.offset;
    return Math.min(this.duration(), Math.max(0, this.ctx.currentTime - this.startedAt));
  }

  _paintProgress() {
    const fill = this.root.querySelector('[data-stem-fill]');
    const time = this.root.querySelector('[data-stem-time]');
    const dur = this.duration();
    const t = this._time();
    if (fill && dur) fill.style.width = `${(t / dur) * 100}%`;
    if (time) {
      const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
      time.textContent = dur ? `${fmt(t)} / ${fmt(dur)}` : '0:00';
    }
    if (this.playing) this.raf = requestAnimationFrame(() => this._paintProgress());
  }

  _paintButtons() {
    const play = this.root.querySelector('[data-stem-play]');
    if (play) play.textContent = this.playing ? 'Pause' : 'Play mix';
    this.root.querySelectorAll('[data-mute]').forEach((btn) => {
      btn.classList.toggle('is-off', this.mute[btn.dataset.mute]);
    });
    this.root.querySelectorAll('[data-solo]').forEach((btn) => {
      btn.classList.toggle('is-on', this.solo[btn.dataset.solo]);
    });
    this.root.querySelectorAll('.jx-stem-row').forEach((row) => {
      const id = row.dataset.id;
      row.classList.toggle('is-silent', !this._audible(id));
    });
  }
}

async function mountStems(el) {
  let tracks = [];
  try { tracks = await loadStemCatalog(); } catch { /* empty */ }
  if (!tracks.length) {
    el.hidden = true;
    return;
  }
  const track = tracks[Math.floor(Math.random() * tracks.length)];
  el.classList.add('jx-card', 'jx-stem');
  el.innerHTML = `
    <p class="jx-kicker">NoDAW · StemSplit</p>
    <h3>Hear each stem</h3>
    <p class="jx-story">${track.title}${track.artist ? ' — ' + track.artist : ''}. Solo a part. Mix stays in the browser. The desktop app splits your own files locally.</p>
    <div class="jx-stem-bar">
      <button type="button" class="jx-btn" data-stem-play>Play mix</button>
      <span class="jx-stem-title">${track.title}${track.artist ? ' — ' + track.artist : ''}</span>
      <span class="jx-stem-time" data-stem-time>0:00</span>
      <a class="jx-link" href="https://liminal-stemsplit.onrender.com/" target="_blank" rel="noopener">Open StemSplit</a>
    </div>
    <div class="jx-scrub" data-stem-scrub>
      <div class="jx-scrub-fill" data-stem-fill></div>
    </div>
    <div class="jx-stem-rows"></div>
    <p class="jx-foot">Another example loads each visit once you drop more splits into <code>blog/stems/</code>.</p>`;
  const rows = el.querySelector('.jx-stem-rows');
  for (const s of track.stems) {
    const row = document.createElement('div');
    row.className = 'jx-stem-row';
    row.dataset.id = s.id;
    row.innerHTML = `
      <span class="jx-dot" style="background:${s.color}"></span>
      <span class="jx-stem-name" style="color:${s.color}">${s.label}</span>
      <button type="button" data-mute="${s.id}">Mute</button>
      <button type="button" data-solo="${s.id}">Solo</button>`;
    rows.append(row);
  }
  const deck = new StemDeck(el, track);
  el.querySelector('[data-stem-play]').addEventListener('click', () => {
    if (deck.playing) deck.pause();
    else deck.play().catch((err) => {
      el.querySelector('.jx-story').textContent = 'Stems could not load (' + (err.message || 'network') + ').';
    });
  });
  el.querySelector('[data-stem-scrub]')?.addEventListener('click', async (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    try {
      await deck.ensure();
      deck.offset = p * deck.duration();
      if (deck.playing) {
        deck._halt();
        deck._start();
      }
      deck._paintProgress();
    } catch { /* ignore */ }
  });
  el.querySelectorAll('[data-mute]').forEach((btn) => btn.addEventListener('click', () => deck.toggleMute(btn.dataset.mute)));
  el.querySelectorAll('[data-solo]').forEach((btn) => btn.addEventListener('click', () => deck.toggleSolo(btn.dataset.solo)));
  document.addEventListener('lacquer-audio-play', (e) => {
    if (e.detail?.src !== 'stems') deck.pause();
  });
}

const tracks = await loadTracks();
for (const el of document.querySelectorAll('[data-ab]')) await mountAb(el, tracks);
for (const el of document.querySelectorAll('[data-stems]')) await mountStems(el);
