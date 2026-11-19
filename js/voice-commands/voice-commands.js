/**
 * Stem Studio voice commands (opt-in, push-to-talk): hold the button (or the V key), say "drop the bass",
 * "solo drums", "play", "stop", "export"... Recognition runs on this device with Earlybird-29M (MIT).
 * The microphone is opened only while the button is held and released right after; audio never leaves the page.
 * Confirmations are spoken by the guide voice (js/guide-voice) when it is mounted.
 */
import { SAMPLE_RATE, MAX_SECONDS, EARLYBIRD_LICENSE } from './models.js';
import { applyCommand } from './actions.js';
import { resample, concat } from './audio-in.js';

const PREF = 'cp-voice-commands';
const prefs = () => { try { return { on: false, speak: true, ...JSON.parse(localStorage.getItem(PREF) || '{}') }; } catch { return { on: false, speak: true }; } };

export class VoiceCommands extends EventTarget {
  constructor() { super(); this.worker = null; this.ready = null; this.req = 0; this.pending = new Map(); this.rec = null; this.starting = null; }
  load() {
    if (!this.worker) {
      this.worker = new Worker(new URL('./earlybird-worker.js', import.meta.url), { type: 'module' });
      this.worker.onerror = (e) => { e.preventDefault?.(); this._r?.rej(new Error(e.message || 'The voice-command worker could not start.')); this.ready = null; this.worker = null; };
      this.worker.onmessage = ({ data }) => {
        if (data.type === 'status') this.dispatchEvent(new CustomEvent('status', { detail: data }));
        else if (data.type === 'ready') this._r?.res();
        else if (data.type === 'result') { this.pending.get(data.id)?.res(data); this.pending.delete(data.id); }
        else if (data.type === 'error') { const p = this.pending.get(data.id); if (p) { p.rej(new Error(data.message)); this.pending.delete(data.id); } else { this._r?.rej(new Error(data.message)); this.ready = null; } }
      };
    }
    return (this.ready ||= new Promise((res, rej) => { this._r = { res, rej }; this.worker.postMessage({ type: 'load' }); }));
  }
  /** 16 kHz mono Float32Array -> {text, command, ms, cands}. */
  async recognise(audio) {
    await this.load(); const id = ++this.req; const a = audio.slice(0, MAX_SECONDS * SAMPLE_RATE);
    return new Promise((res, rej) => { this.pending.set(id, { res, rej }); this.worker.postMessage({ type: 'recognise', id, audio: a }, [a.buffer]); });
  }
  /** Open the mic and start recording (push). */
  start() {
    if (this.starting) return this.starting;
    return (this.starting = (async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      const rec = { chunks: [], stream };
      try {
        rec.ctx = new AudioContext(); rec.sr = rec.ctx.sampleRate;
        await rec.ctx.audioWorklet.addModule(new URL('./capture-worklet.js', import.meta.url));
        rec.src = rec.ctx.createMediaStreamSource(stream); rec.node = new AudioWorkletNode(rec.ctx, 'vc-capture');
        rec.node.port.onmessage = (e) => rec.chunks.push(e.data);
        // keep the node pulled by the audio clock: route it to the output through a muted gain (nothing is heard)
        rec.mute = rec.ctx.createGain(); rec.mute.gain.value = 0; rec.src.connect(rec.node).connect(rec.mute).connect(rec.ctx.destination); rec.node.port.postMessage('start');
      } catch (e) { stream.getTracks().forEach((t) => t.stop()); rec.ctx?.close(); throw e; }
      this.rec = rec; this.dispatchEvent(new CustomEvent('listening'));
    })().catch((e) => { this.starting = null; throw e; }));
  }
  /** Stop recording (release), close the mic, recognise. Returns the result, or null if nothing was recording. */
  async stop() {
    if (!this.starting) return null;
    try { await this.starting; } catch { return null; }
    const rec = this.rec; this.rec = null; this.starting = null;
    rec.node.port.postMessage('stop'); await new Promise((r) => setTimeout(r, 60));
    rec.stream.getTracks().forEach((t) => t.stop()); rec.src.disconnect(); rec.node.disconnect(); rec.mute.disconnect(); rec.ctx.close();
    const audio = resample(concat(rec.chunks), rec.sr, SAMPLE_RATE); this.lastAudio = audio.slice();  // kept for the in-page level meter / debugging
    this.dispatchEvent(new CustomEvent('captured', { detail: { seconds: audio.length / SAMPLE_RATE } }));
    return this.recognise(audio);
  }
}

/** Mount the voice-command panel into Stem Studio (api = window.__studioUi). */
export function mountVoiceCommands(api, { root = document.getElementById('studio-root'), vc = new VoiceCommands() } = {}) {
  const { el, engine: eng } = api, p = prefs();
  const save = () => { try { localStorage.setItem(PREF, JSON.stringify(p)); } catch {} };
  const exportNow = () => { const b = [...root.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Render & export'); b?.click(); };
  const st = el('span', { class: 'muted vc-status', role: 'status', text: p.on ? '' : 'Off. Turn it on to use your voice.' });
  const heard = el('p', { class: 'vc-heard', 'aria-live': 'polite' });
  const talk = el('button', { class: 'btn pri vc-talk', type: 'button', disabled: true, text: '🎙 Hold to talk', 'aria-label': 'Hold to give a voice command (or hold the V key)' });
  const speak = el('input', { type: 'checkbox', checked: p.speak, onchange: () => { p.speak = speak.checked; save(); } });
  const on = el('input', { type: 'checkbox', checked: p.on, onchange: () => { p.on = on.checked; save(); on.checked ? enable() : disable(); } });
  let busy = false;
  vc.addEventListener('status', (e) => { const d = e.detail; st.textContent = d.progress != null ? `${d.text} ${Math.round(d.progress * 100)}%` : d.text; });
  vc.addEventListener('listening', () => { talk.classList.add('on'); st.textContent = 'Listening… release when done.'; });
  async function enable() { talk.disabled = true; try { await vc.load(); talk.disabled = false; st.textContent = 'Ready. Hold the button (or V) and speak.'; } catch (e) { st.textContent = `Could not start voice commands: ${e.message || e}`; } }
  function disable() { talk.disabled = true; st.textContent = 'Off. Turn it on to use your voice.'; }
  async function press() { if (talk.disabled || busy) return; busy = true; api.guide?.stop(); try { await vc.start(); } catch (e) { busy = false; st.textContent = e.name === 'NotAllowedError' ? 'Microphone permission was declined.' : `Microphone error: ${e.message || e}`; } }
  async function release() {
    if (!busy) return; talk.classList.remove('on'); st.textContent = 'Thinking…';
    try {
      const r = await vc.stop(); if (!r) { st.textContent = 'Ready.'; return; }
      const key = applyCommand(r.command, eng, { exportNow });
      const said = api.guide ? await api.guide.textOf(key) : key;
      heard.textContent = r.text ? `Heard “${r.text}” → ${r.command ? said : 'no command'}` : 'Heard nothing. Hold the button while you speak.';
      st.textContent = `Ready. (${Math.round(r.ms)} ms on this device)`;
      vc.dispatchEvent(new CustomEvent('command', { detail: { ...r, key } }));
      if (p.speak && api.guide) api.guide.say(key);
    } catch (e) { st.textContent = `Voice command failed: ${e.message || e}`; } finally { busy = false; }
  }
  talk.addEventListener('pointerdown', (e) => { e.preventDefault(); talk.setPointerCapture?.(e.pointerId); press(); });
  talk.addEventListener('pointerup', release); talk.addEventListener('pointercancel', release);
  const typing = () => { const a = document.activeElement; if (!a) return false; if (a.isContentEditable || /^(SELECT|TEXTAREA)$/.test(a.tagName)) return true; return a.tagName === 'INPUT' && !/^(checkbox|radio|range|button|submit|reset|file|color)$/.test(a.type); };
  document.addEventListener('keydown', (e) => { if (e.code === 'KeyV' && !e.repeat && !typing() && p.on && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); press(); } });
  document.addEventListener('keyup', (e) => { if (e.code === 'KeyV') release(); });
  const card = el('aside', { class: 'card vc-card', 'aria-label': 'Voice commands' },
    el('h2', { class: 'guide-h', text: 'Voice commands (beta)' }),
    el('div', { class: 'bar guide-row' },
      el('label', { class: 'guide-opt' }, on, ' Use my microphone for commands'),
      el('label', { class: 'guide-opt' }, speak, ' Speak confirmations'), talk, st),
    heard,
    el('p', { class: 'muted guide-credit', text: `Say: “drop the bass”, “mute vocals”, “solo drums”, “unsolo”, “unmute all”, “play”, “pause”, “stop”, “export”. The mic is on only while you hold the button; speech is recognised on this device and never uploaded. About 17 MB the first time. Model: Earlybird-29M, ${EARLYBIRD_LICENSE}. ` }, el('a', { href: 'voice-commands-test.html', text: 'Test it with your own voice →' })));
  const after = root.querySelector('.guide-card'), studio = root.querySelector('section.card[aria-labelledby="h-st"]');
  root.insertBefore(card, after ? after.nextSibling : studio || null);
  if (p.on) enable();
  api.voiceCommands = vc; return vc;
}
