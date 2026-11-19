/**
 * Voice Tags: make a spoken producer tag or a guide-vocal line on this device.
 * Engines: ZONOS3 Mini in the browser (WebGPU), ZONOS3 on a local zonos3-server (e.g. the CUDA build), tiny-voca (CPU),
 * Kitten TTS 2 Mini (CPU, in the browser) and VoxMel voice cloning on a local tools/voxmel-server.
 */
import { ENGINES, TINYVOCA_VOICES, KITTEN_VOICES, ZONOS3_MODELS_BASE, ZONOS3_HF_COMMIT, TINYVOCA_HF_COMMIT, KITTEN_HF_COMMIT, VOXMEL_GIT, VOXMEL_GIT_COMMIT, VOXMEL_LOCAL_DEFAULT } from './models.js';
import { normalizePeak, trimSilence, encodeWav, decodeWav, toMono, bytesToBase64 } from './audio.js';

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

/** Client for an on-device TTS worker (tiny-voca, Kitten). */
class WorkerTTS {
  constructor(url) { this.url = url; this.w = null; this.rid = 0; this.pending = new Map(); this.onStatus = () => {}; }
  _worker() {
    if (this.w) return this.w;
    this.w = new Worker(this.url, { type: 'module' });
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
    return { pcm: m.audio, sampleRate: m.sampleRate, ms: m.ms, phonemes: m.phonemes };
  }
}

/** VoxMel voice cloning through tools/voxmel-server on this computer. */
class VoxMel {
  constructor() { this.base = VOXMEL_LOCAL_DEFAULT; this.ready = null; this.onStatus = () => {}; }
  _url(p) { return this.base.replace(/\/$/, '') + p; }
  load() {
    return (this.ready ||= (async () => {
      const r = await fetch(this._url('/v1/health')).catch(() => null);
      if (!r || !r.ok) throw new Error(`No VoxMel server answered at ${this.base}. Start tools/voxmel-server (see its README), then try again.`);
      this.info = await r.json();
    })().catch((e) => { this.ready = null; throw e; }));
  }
  async _post(path, body) {
    const r = await fetch(this._url(path), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) { let d = ''; try { d = (await r.json()).detail; } catch { /* ignore */ } throw new Error(`VoxMel: HTTP ${r.status} ${d || ''}`.trim()); }
    return r;
  }
  async transcribe(refB64) { return (await (await this._post('/v1/transcribe', { reference_wav: refB64 })).json()).text || ''; }
  async speak(text, { seed, ref } = {}) {
    const t0 = performance.now();
    const body = { input: text };
    if (Number.isFinite(seed)) body.seed = seed;
    if (ref) { body.reference_wav = ref.b64; body.reference_text = ref.text || ''; }
    const r = await this._post('/v1/audio/speech', body);
    const { pcm, sampleRate } = decodeWav(new Uint8Array(await r.arrayBuffer()));
    let refText = null; const h = r.headers.get('x-reference-text'); if (h) { try { refText = new TextDecoder().decode(Uint8Array.from(atob(h), (c) => c.charCodeAt(0))); } catch { refText = null; } }
    return { pcm, sampleRate, ms: performance.now() - t0, seed: r.headers.get('x-seed'), refText };
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
  const engines = { tinyvoca: new WorkerTTS(new URL('./tinyvoca-worker.js', import.meta.url)), kitten: new WorkerTTS(new URL('./kitten-worker.js', import.meta.url)), zonos3: new Zonos3('web'), local: new Zonos3('local'), voxmel: new VoxMel() };
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
  const allEngines = [...ENGINES, { id: 'local', label: 'ZONOS3 on this computer', blurb: 'Uses a zonos3-server you run yourself (for example the CUDA build on your GPU) at the address below. Fastest if you have one running.', license: 'Same as ZONOS3 Mini' },
    { id: 'voxmel', label: 'VoxMel voice clone (on this computer)', blurb: 'Clones a voice from a short clip you provide, using a VoxMel server you run yourself (tools/voxmel-server). Works on a CPU (a few seconds per line), faster on a GPU. The clip goes to that server only.', license: 'Code and weights Apache-2.0 (VoxDance-Lab); trained on the Emilia dataset (CC BY-NC 4.0), see Licences below' }];
  // VoxMel: server address, reference clip, its transcript, consent
  const ref = { b64: null, name: '', seconds: 0 };
  const refFile = el('input', { id: 'vt-ref', type: 'file', accept: 'audio/*,.wav,.mp3,.m4a,.flac,.ogg', 'aria-label': 'Reference clip' });
  const refInfo = el('span', { class: 'muted', id: 'vt-ref-info', text: '5–15 s of one person speaking clearly, no music.' });
  const refAudio = el('audio', { controls: true, hidden: true, id: 'vt-ref-audio' });
  const refText = el('textarea', { id: 'vt-ref-text', rows: 2, maxlength: 400, placeholder: 'Exactly what the clip says (or press Transcribe)', 'aria-label': 'Transcript of the reference clip', style: 'width:100%' });
  const consent = el('input', { id: 'vt-consent', type: 'checkbox' });
  const transcribeBtn = el('button', { type: 'button', class: 'btn sm', id: 'vt-transcribe', text: 'Transcribe', onclick: async () => {
    if (!ref.b64) { setStatus('Choose a reference clip first.'); return; }
    try { await busy('Transcribing the clip on your VoxMel server…', async () => { await engines.voxmel.load(); refText.value = await engines.voxmel.transcribe(ref.b64); }); setStatus('Check the transcript: it must match the clip word for word.'); }
    catch (e) { setStatus(e.message || String(e)); }
  } });
  refFile.addEventListener('change', async () => {
    const f = refFile.files?.[0]; ref.b64 = null; refAudio.hidden = true; if (!f) return;
    try {
      const ac = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 1, 44100);
      const buf = await ac.decodeAudioData(await f.arrayBuffer());
      const mono = toMono(buf, 30);
      ref.b64 = bytesToBase64(encodeWav(mono, buf.sampleRate)); ref.name = f.name; ref.seconds = mono.length / buf.sampleRate;
      refAudio.src = URL.createObjectURL(f); refAudio.hidden = false;
      refInfo.textContent = `${f.name} · ${ref.seconds.toFixed(1)} s${buf.duration > 30 ? ' (first 30 s used)' : ''}${ref.seconds < 3 ? ' · short clips clone poorly, 5–15 s works best' : ''}`;
    } catch (e) { refInfo.textContent = `Could not read that file: ${e.message || e}`; }
  });
  const extraVoxmel = el('div', { id: 'vt-voxmel-panel', hidden: true, style: 'margin:0 0 .5rem 1.6rem' },
    el('div', { class: 'row', style: 'gap:.5rem;margin-bottom:.4rem' }, el('label', { for: 'vt-voxmel-url', text: 'Server' }),
      el('input', { id: 'vt-voxmel-url', type: 'url', value: VOXMEL_LOCAL_DEFAULT, style: 'min-width:16rem', onchange: (e) => { engines.voxmel.base = e.target.value; engines.voxmel.ready = null; } })),
    el('div', { class: 'row', style: 'gap:.5rem;flex-wrap:wrap;margin-bottom:.4rem' }, el('label', { for: 'vt-ref', text: 'Voice to clone' }), refFile, refInfo),
    refAudio,
    el('div', { style: 'margin:.4rem 0' }, el('label', { for: 'vt-ref-text', text: 'What the clip says' }), refText, transcribeBtn),
    el('div', { class: 'row', style: 'gap:.5rem' }, consent, el('label', { for: 'vt-consent', text: 'This is my own voice, or I have the speaker’s permission to clone it.' })));
  for (const e of allEngines) {
    const id = `vt-eng-${e.id}`;
    const r = el('input', { type: 'radio', name: 'vt-engine', id, value: e.id, checked: state.engine === e.id, disabled: e.id === 'zonos3', onchange: () => { state.engine = e.id; extraLocal.hidden = e.id !== 'local'; extraVoxmel.hidden = e.id !== 'voxmel'; refreshVoices(); } });
    engBox.append(el('div', { class: 'row' }, r, el('label', { for: id }, el('b', { text: e.label }), e.id === 'zonos3' ? el('span', { class: 'muted', id: 'vt-gpu-note', text: ' (checking for WebGPU…)' }) : '')),
      el('div', { style: 'margin:0 0 .5rem 1.6rem' }, el('span', { class: 'muted', text: `${e.blurb} Licence: ${e.license}.` })));
    if (e.id === 'local') engBox.append(extraLocal);
    if (e.id === 'voxmel') engBox.append(extraVoxmel);
  }

  const voiceSel = el('select', { id: 'vt-voice', 'aria-label': 'Voice' });
  const speed = el('input', { id: 'vt-speed', type: 'range', min: 0.7, max: 1.4, step: 0.05, value: 1, 'aria-label': 'Speed' });
  const seed = el('input', { id: 'vt-seed', type: 'number', min: 0, step: 1, placeholder: 'random', style: 'width:7rem', 'aria-label': 'Seed (same seed = same take)' });
  const speedRow = el('div', { class: 'row', style: 'gap:.5rem' }, el('label', { for: 'vt-speed', text: 'Speed' }), speed);
  const seedRow = el('div', { class: 'row', style: 'gap:.5rem' }, el('label', { for: 'vt-seed', text: 'Seed' }), seed, el('span', { class: 'muted', text: 'Same seed and text give the same take.' }));
  const speakerRow = el('div', { class: 'row', style: 'gap:.5rem' }, el('label', { for: 'vt-voice', text: 'Speaker' }), voiceSel);
  const opts = el('fieldset', { class: 'mb' }, el('legend', { text: 'Voice' }), speakerRow, speedRow, seedRow);
  const loadVoicesBtn = el('button', { type: 'button', class: 'btn sm', text: 'Load ZONOS3 voices', onclick: () => refreshVoices(true) });

  async function refreshVoices(load = false) {
    const onDevice = state.engine === 'tinyvoca' || state.engine === 'kitten', isClone = state.engine === 'voxmel';
    speedRow.hidden = !onDevice; seedRow.hidden = onDevice; speakerRow.hidden = isClone;
    voiceSel.textContent = '';
    if (onDevice) { for (const v of (state.engine === 'kitten' ? KITTEN_VOICES : TINYVOCA_VOICES)) voiceSel.append(el('option', { value: v.id, text: v.label })); loadVoicesBtn.remove(); return; }
    if (isClone) { loadVoicesBtn.remove(); return; }
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
    if (engId === 'voxmel') {
      if (!ref.b64) { setStatus('Choose a short clip of the voice to clone.'); return; }
      if (!consent.checked) { setStatus('Tick the box to confirm you may clone this voice.'); return; }
    }
    try {
      const seedV = seed.value === '' ? undefined : +seed.value;
      const r = await busy('Making the tag…', async () => {
        await eng.load(); setStatus(engId === 'voxmel' ? 'Cloning the voice on your VoxMel server…' : 'Speaking…');
        if (engId === 'tinyvoca') return eng.speak(line, { voice: +voiceSel.value || 0, speed: +speed.value });
        if (engId === 'kitten') return eng.speak(line, { voice: voiceSel.value || 'eleanor', speed: +speed.value });
        if (engId === 'voxmel') return eng.speak(line, { seed: seedV, ref: { b64: ref.b64, text: refText.value.trim() } });
        return eng.speak(line, { voice: voiceSel.value || undefined, seed: seedV });
      });
      if (engId === 'voxmel' && r.refText && !refText.value.trim()) refText.value = r.refText;
      let pcm = trimSilence(r.pcm, r.sampleRate); pcm = normalizePeak(pcm.slice(), -1);
      const wav = encodeWav(pcm, r.sampleRate), url = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
      const name = `tag-${line.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'voice'}-${engId}.wav`;
      const vLabel = engId === 'voxmel' ? `clone of ${ref.name}` : (voiceSel.selectedOptions[0]?.textContent || '');
      const take = { engine: engId, voice: vLabel, text: line, phonemes: r.phonemes, sampleRate: r.sampleRate, seconds: pcm.length / r.sampleRate, ms: r.ms, seed: r.seed, wav, url, name };
      state.takes.unshift(take);
      takes.prepend(el('li', { class: 'mb' }, el('div', null, el('b', { text: `“${line}”` }), el('span', { class: 'muted', text: ` · ${allEngines.find((e) => e.id === engId).label}${vLabel ? ' · ' + vLabel : ''} · ${take.seconds.toFixed(2)} s · made in ${(r.ms / 1000).toFixed(1)} s${r.seed ? ' · seed ' + r.seed : ''}` })),
        el('div', { class: 'row', style: 'gap:.5rem' }, el('audio', { controls: true, src: url, preload: 'auto' }), el('a', { class: 'btn sm', href: url, download: name, text: 'Download WAV' }))));
      setStatus(`Done. Peak normalised to −1 dBFS, silence trimmed.`);
    } catch (e) { setStatus(`Could not make the tag: ${e.message || e}`); }
  }

  const lic = el('details', { class: 'mb' }, el('summary', { text: 'Licences: what you may do with each voice' }),
    el('p', { class: 'muted' }, 'ZONOS3 Mini by Zyphra: code MIT, weights Apache-2.0 (', el('a', { href: `https://huggingface.co/Zyphra/ZONOS3-Mini/tree/${ZONOS3_HF_COMMIT}`, target: '_blank', rel: 'noopener', text: 'model' }), '). tiny-voca by n4ze3m: code and weights Apache-2.0 (', el('a', { href: `https://huggingface.co/n4ze3m/tiny-voca/tree/${TINYVOCA_HF_COMMIT}`, target: '_blank', rel: 'noopener', text: 'model' }), '), phonemizer dizione (Apache-2.0) with CMUdict (BSD-style). Models are downloaded from Hugging Face at pinned versions and cached in your browser. Your text never leaves this device.'),
    el('p', { class: 'muted' }, 'Kitten TTS 2 Mini by KittenML: code and weights Apache-2.0 (', el('a', { href: `https://huggingface.co/KittenML/kitten-tts-2-mini/tree/${KITTEN_HF_COMMIT}`, target: '_blank', rel: 'noopener', text: 'model' }), '), English front end misaki (Apache-2.0) with a CMUdict lexicon and a small Apache-2.0 G2P model, run in your browser with Pyodide.'),
    el('p', { class: 'muted' }, 'VoxMel by VoxDance-Lab: code and weights Apache-2.0 (', el('a', { href: `https://github.com/${VOXMEL_GIT}/tree/${VOXMEL_GIT_COMMIT}`, target: '_blank', rel: 'noopener', text: 'code' }), '). It was trained on the Emilia dataset, which is licensed CC BY-NC 4.0 (non-commercial). The model licence itself allows commercial use, but whether that carries over from the training data is not settled: check before you sell a track that uses a VoxMel voice. VoxMel runs only on your own computer; this site does not host it.'),
    el('p', { class: 'muted', text: 'Do not use these voices to imitate a real person without their consent. Only clone your own voice or a voice you have written permission to use.' }));

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
