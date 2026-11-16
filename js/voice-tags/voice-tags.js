/**
 * Voice Tags: make a spoken producer tag or a guide-vocal line on this device.
 * Engines: ZONOS3 Mini in the browser (WebGPU), ZONOS3 on a local zonos3-server (e.g. the CUDA build), tiny-voca (CPU).
 */
import { ENGINES, TINYVOCA_VOICES, ZONOS3_MODELS_BASE, ZONOS3_HF_COMMIT, TINYVOCA_HF_COMMIT } from './models.js';
import { normalizePeak, trimSilence, encodeWav, decodeWav } from './audio.js';

const PRESETS = ['Produced by Beez.', 'CoProducer, turn it up!', 'NoDAW Labs.', 'Yeah, run it back.'];
const LOCAL_DEFAULT = 'http://127.0.0.1:1919';

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'text') e.textContent = v;
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
}

/** tiny-voca client (worker). */
class TinyVoca {
  constructor() { this.w = null; this.rid = 0; this.pending = new Map(); this.onStatus = () => {}; }
  _worker() {
    if (this.w) return this.w;
    this.w = new Worker(new URL('./tinyvoca-worker.js', import.meta.url), { type: 'module' });
    this.w.onmessage = ({ data: m }) => {
      if (m.type === 'status') return this.onStatus(m.text, m.progress);
      const p = this.pending.get(m.id ?? 'load'); if (!p) return; this.pending.delete(m.id ?? 'load');
      m.type === 'error' ? p.reject(new Error(m.message)) : p.resolve(m);
    };
    this.w.onerror = (e) => { for (const p of this.pending.values()) p.reject(new Error(e.message || 'worker failed')); this.pending.clear(); this.w = null; };
    return this.w;
  }
  load() { return new Promise((resolve, reject) => { this.pending.set('load', { resolve, reject }); this._worker().postMessage({ type: 'load' }); }); }
  async speak(text, { voice = 0, speed = 1 } = {}) {
    const id = ++this.rid;
    const m = await new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this._worker().postMessage({ type: 'speak', id, text, voice, speed }); });
    return { pcm: m.audio, sampleRate: m.sampleRate, ms: m.ms };
  }
}

/** ZONOS3 through the v1/v2 API: either the in-browser WebGPU engine or a local server. */
class Zonos3 {
  constructor(mode) { this.mode = mode; this.base = LOCAL_DEFAULT; this.mod = null; this.ready = null; this.onStatus = () => {}; }
  async _fetch(path, init) {
    if (this.mode === 'local') return fetch(this.base.replace(/\/$/, '') + path, init);
    return this.mod.localFetch(path, init);
  }
  load() {
    return (this.ready ||= (async () => {
      if (this.mode === 'web') {
        if (!navigator.gpu) throw new Error('WebGPU is not available in this browser. Use desktop Chrome or Edge, or pick tiny-voca.');
        this.onStatus('Starting the ZONOS3 engine');
        this.mod = await import('./vendor/zonos3-web/engine.js');
        await this.mod.engine.init((p) => this.onStatus(p.fetched ? 'Downloading ZONOS3 (first time only)' : 'Loading ZONOS3 from this device', p.total ? p.loaded / p.total : undefined), { base: ZONOS3_MODELS_BASE });
      } else {
        const r = await this._fetch('/v2/health').catch(() => null);
        if (!r || !r.ok) throw new Error(`No ZONOS3 server answered at ${this.base}. Start zonos3-server, then try again.`);
      }
    })().catch((e) => { this.ready = null; throw e; }));
  }
  async voices() {
    const r = await this._fetch('/v2/speakers'); if (!r.ok) return [];
    const j = await r.json();
    return (j.speakers || []).map((s) => ({ id: s.id, label: s.label }));
  }
  async speak(text, { voice, seed } = {}) {
    const t0 = performance.now();
    const body = { model: 'zonos3-mini', input: text, response_format: 'wav' };
    if (voice) body.voice = voice; if (Number.isFinite(seed)) body.seed = seed;
    const r = await this._fetch('/v1/audio/speech', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) { let d = ''; try { d = (await r.json()).detail; } catch { /* ignore */ } throw new Error(`ZONOS3: HTTP ${r.status} ${typeof d === 'string' ? d : JSON.stringify(d)}`); }
    const { pcm, sampleRate } = decodeWav(new Uint8Array(await r.arrayBuffer()));
    return { pcm, sampleRate, ms: performance.now() - t0, seed: r.headers.get('x-seed') };
  }
}

export function mountVoiceTags(root) {
  const engines = { tinyvoca: new TinyVoca(), zonos3: new Zonos3('web'), local: new Zonos3('local') };
  const state = { engine: 'tinyvoca', takes: [], busy: false, gpu: null };
  const status = el('div', { class: 'muted', role: 'status', 'aria-live': 'polite' });
  const bar = el('progress', { max: 1, hidden: true, style: 'width:100%' });
  const setStatus = (t, p) => { status.textContent = t || ''; if (p == null) bar.removeAttribute('value'); else bar.value = p; };
  for (const e of Object.values(engines)) e.onStatus = setStatus;

  const text = el('textarea', { id: 'vt-text', rows: 2, maxlength: 400, 'aria-label': 'What should the voice say?', style: 'width:100%;font-size:1.1rem' });
  text.value = PRESETS[0];
  const chips = el('div', { class: 'row', style: 'gap:.4rem;flex-wrap:wrap;margin:.4rem 0' }, PRESETS.map((p) => el('button', { type: 'button', class: 'btn sm', text: p, onclick: () => { text.value = p; } })));

  const engBox = el('fieldset', { class: 'mb' }, el('legend', { text: 'Voice engine' }));
  const extraLocal = el('div', { class: 'row', hidden: true, style: 'margin:0 0 .5rem 1.6rem;gap:.5rem' },
    el('label', { for: 'vt-local', text: 'Server' }), el('input', { id: 'vt-local', type: 'url', value: LOCAL_DEFAULT, style: 'min-width:16rem', onchange: (e) => { engines.local.base = e.target.value; engines.local.ready = null; } }));
  const allEngines = [...ENGINES, { id: 'local', label: 'ZONOS3 on this computer', blurb: 'Uses a zonos3-server you run yourself (for example the CUDA build on your GPU) at the address below. Fastest if you have one running.', license: 'Same as ZONOS3 Mini' }];
  for (const e of allEngines) {
    const id = `vt-eng-${e.id}`;
    const r = el('input', { type: 'radio', name: 'vt-engine', id, value: e.id, checked: state.engine === e.id, disabled: e.id === 'zonos3', onchange: () => { state.engine = e.id; extraLocal.hidden = e.id !== 'local'; refreshVoices(); } });
    engBox.append(el('div', { class: 'row' }, r, el('label', { for: id }, el('b', { text: e.label }), e.id === 'zonos3' ? el('span', { class: 'muted', id: 'vt-gpu-note', text: ' (checking for WebGPU…)' }) : '')),
      el('div', { style: 'margin:0 0 .5rem 1.6rem' }, el('span', { class: 'muted', text: `${e.blurb} Licence: ${e.license}.` })));
    if (e.id === 'local') engBox.append(extraLocal);
  }

  const voiceSel = el('select', { id: 'vt-voice', 'aria-label': 'Voice' });
  const speed = el('input', { id: 'vt-speed', type: 'range', min: 0.7, max: 1.4, step: 0.05, value: 1, 'aria-label': 'Speed' });
  const seed = el('input', { id: 'vt-seed', type: 'number', min: 0, step: 1, placeholder: 'random', style: 'width:7rem', 'aria-label': 'Seed (same seed = same take)' });
  const speedRow = el('div', { class: 'row', style: 'gap:.5rem' }, el('label', { for: 'vt-speed', text: 'Speed' }), speed);
  const seedRow = el('div', { class: 'row', style: 'gap:.5rem' }, el('label', { for: 'vt-seed', text: 'Seed' }), seed, el('span', { class: 'muted', text: 'Same seed and text give the same take.' }));
  const opts = el('fieldset', { class: 'mb' }, el('legend', { text: 'Voice' }), el('div', { class: 'row', style: 'gap:.5rem' }, el('label', { for: 'vt-voice', text: 'Speaker' }), voiceSel), speedRow, seedRow);
  const loadVoicesBtn = el('button', { type: 'button', class: 'btn sm', text: 'Load ZONOS3 voices', onclick: () => refreshVoices(true) });

  async function refreshVoices(load = false) {
    const isZ = state.engine !== 'tinyvoca';
    speedRow.hidden = isZ; seedRow.hidden = !isZ;
    voiceSel.textContent = '';
    if (!isZ) { for (const v of TINYVOCA_VOICES) voiceSel.append(el('option', { value: v.id, text: v.label })); loadVoicesBtn.remove(); return; }
    voiceSel.append(el('option', { value: '', text: 'Default voice' }));
    const z = engines[state.engine];
    if (!z.ready && !load) { voiceSel.after(loadVoicesBtn); return; }
    loadVoicesBtn.remove();
    try { await busy('Loading voices', async () => { await z.load(); for (const v of await z.voices()) voiceSel.append(el('option', { value: v.id, text: v.label })); }); }
    catch (e) { setStatus(e.message || String(e)); }
  }

  const takes = el('ol', { class: 'plain', id: 'vt-takes', 'aria-label': 'Takes' });
  const go = el('button', { class: 'btn pri', type: 'button', id: 'vt-go', text: 'Make tag', onclick: () => make() });
  async function busy(label, fn) {
    state.busy = true; go.disabled = true; bar.hidden = false; setStatus(label);
    try { return await fn(); } finally { state.busy = false; go.disabled = false; bar.hidden = true; }
  }
  async function make() {
    const line = text.value.trim(); if (!line) { setStatus('Type something for the voice to say.'); return; }
    const engId = state.engine, eng = engines[engId];
    try {
      const r = await busy('Making the tag…', async () => {
        await eng.load(); setStatus('Speaking…');
        return engId === 'tinyvoca' ? eng.speak(line, { voice: +voiceSel.value || 0, speed: +speed.value }) : eng.speak(line, { voice: voiceSel.value || undefined, seed: seed.value === '' ? undefined : +seed.value });
      });
      let pcm = trimSilence(r.pcm, r.sampleRate); pcm = normalizePeak(pcm.slice(), -1);
      const wav = encodeWav(pcm, r.sampleRate), url = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
      const name = `tag-${line.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'voice'}-${engId}.wav`;
      const vLabel = voiceSel.selectedOptions[0]?.textContent || '';
      const take = { engine: engId, voice: vLabel, text: line, sampleRate: r.sampleRate, seconds: pcm.length / r.sampleRate, ms: r.ms, seed: r.seed, wav, url, name };
      state.takes.unshift(take);
      takes.prepend(el('li', { class: 'mb' }, el('div', null, el('b', { text: `“${line}”` }), el('span', { class: 'muted', text: ` · ${allEngines.find((e) => e.id === engId).label}${vLabel ? ' · ' + vLabel : ''} · ${take.seconds.toFixed(2)} s · made in ${(r.ms / 1000).toFixed(1)} s${r.seed ? ' · seed ' + r.seed : ''}` })),
        el('div', { class: 'row', style: 'gap:.5rem' }, el('audio', { controls: true, src: url, preload: 'auto' }), el('a', { class: 'btn sm', href: url, download: name, text: 'Download WAV' }))));
      setStatus(`Done. Peak normalised to −1 dBFS, silence trimmed.`);
    } catch (e) { setStatus(`Could not make the tag: ${e.message || e}`); }
  }

  const lic = el('details', { class: 'mb' }, el('summary', { text: 'Licences: free to use in your tracks and products' }),
    el('p', { class: 'muted' }, 'ZONOS3 Mini by Zyphra: code MIT, weights Apache-2.0 (', el('a', { href: `https://huggingface.co/Zyphra/ZONOS3-Mini/tree/${ZONOS3_HF_COMMIT}`, target: '_blank', rel: 'noopener', text: 'model' }), '). tiny-voca by n4ze3m: code and weights Apache-2.0 (', el('a', { href: `https://huggingface.co/n4ze3m/tiny-voca/tree/${TINYVOCA_HF_COMMIT}`, target: '_blank', rel: 'noopener', text: 'model' }), '), phonemizer dizione (Apache-2.0) with CMUdict (BSD-style). Models are downloaded from Hugging Face at pinned versions and cached in your browser. Your text never leaves this device.'),
    el('p', { class: 'muted', text: 'Do not use these voices to imitate a real person without their consent.' }));

  root.append(el('section', { class: 'card', 'aria-labelledby': 'vt-h' }, el('h2', { id: 'vt-h' }, el('span', { class: 'n', text: '1' }), 'Write your tag'), text, chips, engBox, opts,
    el('div', { class: 'fxhead' }, go), bar, status, lic),
  el('section', { class: 'card', 'aria-labelledby': 'vt-h2' }, el('h2', { id: 'vt-h2' }, el('span', { class: 'n', text: '2' }), 'Takes'), el('p', { class: 'muted', text: 'Each take is trimmed and peak-normalised to −1 dBFS. Drag a WAV into your DAW or into Stem Studio.' }), takes));
  refreshVoices();
  // ZONOS3 in the browser needs a real WebGPU adapter (navigator.gpu alone is not enough: headless / blocklisted GPUs return none).
  (async () => {
    let a = null; try { a = await navigator.gpu?.requestAdapter(); } catch { a = null; }
    state.gpu = !!a; const r = root.querySelector('#vt-eng-zonos3'), note = root.querySelector('#vt-gpu-note');
    if (a) { r.disabled = false; note.textContent = ''; if (!state.busy && !state.takes.length) { r.checked = true; state.engine = 'zonos3'; refreshVoices(); } }
    else note.textContent = ' (WebGPU not available here: use tiny-voca, or a local ZONOS3 server)';
  })();
  window.__voiceTags = { state, engines, make, refreshVoices };
  return window.__voiceTags;
}
