/**
 * Stem Studio guide voice (Inflect Mini v3, "hope"): spoken tips and spoken confirmations for voice commands.
 * Built-in clips (./clips, pre-rendered) need no download. The live engine (inflect-worker.js) is opt-in and only
 * offered when an ONNX host is configured (models.js INFLECT_ONNX_BASE or ?inflectbase=).
 */
import { CLIPS_BASE, INFLECT_LICENSE, INFLECT_VOICE, inflectBase } from './models.js';

const PREF = 'cp-guide-voice';
const loadPrefs = () => { try { return { tips: false, vol: 0.8, ...JSON.parse(localStorage.getItem(PREF) || '{}') }; } catch { return { tips: false, vol: 0.8 }; } };

export class GuideVoice extends EventTarget {
  constructor({ clipsBase = CLIPS_BASE, base = inflectBase() } = {}) {
    super(); this.clipsBase = clipsBase; this.base = base; this.prefs = loadPrefs(); this.manifest = null; this.audio = null;
    this.worker = null; this.workerReady = null; this.reqId = 0; this.pending = new Map(); this.ctx = null; this.src = null;
  }
  get liveAvailable() { return !!this.base; }
  save() { try { localStorage.setItem(PREF, JSON.stringify(this.prefs)); } catch {} }
  async clips() {
    if (!this.manifest) this.manifest = fetch(this.clipsBase + 'clips.json').then((r) => { if (!r.ok) throw new Error('clips.json HTTP ' + r.status); return r.json(); });
    return (await this.manifest).clips;
  }
  textOf = async (key) => (await this.clips())[key]?.text || '';
  stop() { if (this.audio) { this.audio.pause(); this.audio = null; } if (this.src) { try { this.src.stop(); } catch {} this.src = null; } }
  /** Play a built-in clip by key ('tip:welcome', 'mute:bass', 'play', ...). Resolves true when it finished playing, false if unknown or it could not play. */
  async say(key) {
    const c = (await this.clips())[key]; if (!c) return false;
    this.stop(); const a = new Audio(this.clipsBase + c.file); a.volume = this.prefs.vol; this.audio = a;
    this.dispatchEvent(new CustomEvent('say', { detail: { key, text: c.text } }));
    const ok = await new Promise((res) => { a.onended = () => res(true); a.onerror = () => res(false); a.play().catch(() => res(false)); });
    if (this.audio === a) this.audio = null; return ok;
  }
  /** Live engine: synthesize any text in the browser. Throws if no host is configured. */
  async loadLive(onStatus) {
    if (!this.base) throw new Error('The live guide voice is not set up on this site yet.');
    if (!this.worker) {
      this.worker = new Worker(new URL('./inflect-worker.js', import.meta.url), { type: 'module' });
      this.worker.onerror = (e) => { e.preventDefault?.(); this._ready?.rej(new Error(e.message || 'The guide voice worker could not start.')); this.workerReady = null; this.worker = null; };
      this.worker.onmessage = ({ data }) => {
        if (data.type === 'status') this.dispatchEvent(new CustomEvent('status', { detail: data }));
        else if (data.type === 'ready') this._ready?.res();
        else if (data.type === 'done') { this.pending.get(data.id)?.res(data); this.pending.delete(data.id); }
        else if (data.type === 'error') { if (data.id != null && this.pending.has(data.id)) { this.pending.get(data.id).rej(new Error(data.message)); this.pending.delete(data.id); } else { this._ready?.rej(new Error(data.message)); this.workerReady = null; } }
      };
    }
    if (onStatus) this.addEventListener('status', (e) => onStatus(e.detail));
    return (this.workerReady ||= new Promise((res, rej) => { this._ready = { res, rej }; this.worker.postMessage({ type: 'load', base: this.base }); }));
  }
  async synth(text, voice = INFLECT_VOICE) {
    await this.loadLive(); const id = ++this.reqId;
    return new Promise((res, rej) => { this.pending.set(id, { res, rej }); this.worker.postMessage({ type: 'speak', id, text, voice }); });
  }
  async speakLive(text, voice) {
    const r = await this.synth(text, voice);
    this.stop(); this.ctx ||= new AudioContext();
    const b = this.ctx.createBuffer(1, r.audio.length, r.sampleRate); b.copyToChannel(r.audio, 0);
    const g = this.ctx.createGain(); g.gain.value = this.prefs.vol; const s = this.ctx.createBufferSource(); s.buffer = b; s.connect(g).connect(this.ctx.destination);
    this.src = s; await new Promise((res) => { s.onended = res; s.start(); }); return r;
  }
}

/** Tip to offer next, from what is on screen. */
export function nextTip(state, heard = new Set()) {
  const order = state.stems ? ['lanes', 'fx', 'ab', 'clean', state.hasDrums ? 'drums' : null, state.hasVocals ? 'vocals' : null, 'loudness', 'export', 'voice', 'voice_examples']
    : ['welcome', 'split'];
  const list = order.filter(Boolean); return list.find((t) => !heard.has(t)) || list[0];
}

/** Mount the guide panel into Stem Studio (api = window.__studioUi). Returns the GuideVoice. */
export function mountGuide(api, { root = document.getElementById('studio-root'), guide = new GuideVoice() } = {}) {
  const { el, engine: eng } = api, heard = new Set();
  const state = () => ({ stems: eng.tracks.length > 0, hasDrums: eng.tracks.some((t) => /drum|kick|snare|hats/.test(t.kind)), hasVocals: eng.tracks.some((t) => /vocal|lead|backing/.test(t.kind)) });
  const caption = el('p', { class: 'muted guide-caption', 'aria-live': 'polite', text: '' });
  guide.addEventListener('say', (e) => { caption.textContent = `“${e.detail.text}”`; });
  const playTip = async () => { const id = nextTip(state(), heard); heard.add(id); await guide.say('tip:' + id); };
  const tipsBox = el('input', { type: 'checkbox', checked: guide.prefs.tips, onchange: () => { guide.prefs.tips = tipsBox.checked; guide.save(); if (tipsBox.checked) playTip(); else guide.stop(); } });
  const vol = el('input', { type: 'range', min: 0, max: 1, step: 0.05, value: guide.prefs.vol, 'aria-label': 'Guide voice volume', oninput: () => { guide.prefs.vol = +vol.value; guide.save(); if (guide.audio) guide.audio.volume = guide.prefs.vol; } });
  const kids = [
    el('h2', { class: 'guide-h', text: 'Guide voice' }),
    el('div', { class: 'bar guide-row' },
      el('label', { class: 'guide-opt' }, tipsBox, ' Speak tips as I work'),
      el('button', { class: 'btn sm', type: 'button', text: '▶ Play a tip', onclick: playTip }),
      el('button', { class: 'btn sm', type: 'button', text: '■ Quiet', onclick: () => guide.stop() }),
      el('label', { class: 'guide-opt' }, 'Volume ', vol)),
    caption,
  ];
  if (guide.liveAvailable) {
    const txt = el('input', { type: 'text', class: 'guide-text', value: 'Your stems are ready. Try soloing the vocals.', 'aria-label': 'Text for the guide voice to say', maxlength: 400 });
    const st = el('span', { class: 'muted guide-status', text: '' });
    const go = el('button', { class: 'btn sm pri', type: 'button', text: 'Say it (live, in your browser)', onclick: async () => {
      go.disabled = true;
      try { st.textContent = 'Loading…'; await guide.loadLive((d) => { st.textContent = d.progress != null ? `${d.text} ${Math.round(d.progress * 100)}%` : d.text; }); st.textContent = 'Speaking…';
        caption.textContent = `“${txt.value}”`; const r = await guide.speakLive(txt.value); st.textContent = `Made ${(r.audio.length / r.sampleRate).toFixed(1)} s of speech in ${(r.ms / 1000).toFixed(2)} s on this device.`; }
      catch (e) { st.textContent = `Live voice failed: ${e.message || e}`; } finally { go.disabled = false; } } });
    kids.push(el('div', { class: 'bar guide-row' }, txt, go), st);
  }
  kids.push(el('p', { class: 'muted guide-credit', text: `Voice: Inflect Mini v3 (“${INFLECT_VOICE}”), ${INFLECT_LICENSE}. Clips are built in; nothing is downloaded for tips.` }));
  const card = el('aside', { class: 'card guide-card', 'aria-label': 'Guide voice' }, ...kids);
  const studio = root.querySelector('section.card[aria-labelledby="h-st"]');
  root.insertBefore(card, studio || null);
  eng.addEventListener('change', (ev) => { if (ev.detail.what === 'tracks' && guide.prefs.tips && eng.tracks.length && !heard.has('lanes')) { heard.add('lanes'); guide.say('tip:lanes'); } });
  api.guide = guide;
  return guide;
}
