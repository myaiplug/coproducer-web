/**
 * Module worker: Kitten TTS 2 Mini (KittenML, code and weights Apache-2.0) on the CPU.
 * Text front end: KittenML's own English front end (tts_norm -> misaki lexicon -> CMUdict -> BART G2P) in Pyodide,
 * with spaCy replaced by a rule-based tagger and the BART run in NumPy (vendor/kitten-frontend, see its NOTICE).
 * Model: the int8 ONNX file on ONNX Runtime Web (wasm), vendored with the stem splitter.
 * Mirrors kittenml/kittentts2_tiny/model.py (tokens, style row, trimming, 0.15 s gap between chunks).
 * in : {type:'load'} | {type:'speak', id, text, voice, speed}
 * out: {type:'status', text, progress} | {type:'ready', sampleRate} | {type:'done', id, audio, sampleRate, ms, phonemes} | {type:'error', id?, message}
 */
import { ORT_MODULE_URL, ORT_WASM_BASE, ORT_CDN_MODULE_URL, ORT_CDN_BASE } from '../roformer-web/models.js';
import { KITTEN_FILES, KITTEN_WHEELS, KITTEN_FRONTEND_BASE, KITTEN_FRONTEND_FILES, PYODIDE_BASE } from './models.js';
import { limitPeak, sha256Hex } from './audio.js';

const CACHE = 'voice-tags-kitten-v1';
const REPO = '/kitten-repo';
const SAMPLE_RATE = 24000, GAP_S = 0.15, END_TOKEN = 10;
let ort, pyodide, phonemizeJson, session, vocab, packs = {}, loading = null;
const status = (text, progress) => postMessage({ type: 'status', text, progress });

async function importOrt() {
  try { const m = await import(/* @vite-ignore */ ORT_MODULE_URL); m.env.wasm.wasmPaths = ORT_WASM_BASE; return m; }
  catch { const m = await import(/* @vite-ignore */ ORT_CDN_MODULE_URL); m.env.wasm.wasmPaths = ORT_CDN_BASE; return m; }
}

async function download(url, label, sha256, cache = true) {
  let store = null;
  if (cache) { try { store = await caches.open(CACHE); const hit = await store.match(url); if (hit) return new Uint8Array(await hit.arrayBuffer()); } catch { store = null; } }
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  const total = Number(r.headers.get('content-length')) || 0;
  let bytes;
  if (!r.body || !total) bytes = new Uint8Array(await r.arrayBuffer());
  else {
    const reader = r.body.getReader(), chunks = []; let got = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); got += value.length; status(label, got / total); }
    bytes = new Uint8Array(got); let o = 0; for (const c of chunks) { bytes.set(c, o); o += c.length; }
  }
  if (sha256) { const h = await sha256Hex(bytes); if (h !== sha256) throw new Error(`${label}: checksum mismatch (${h.slice(0, 12)}…)`); }
  if (store) store.put(url, new Response(bytes)).catch(() => {});
  return bytes;
}

async function loadFrontend() {
  status('Loading the Kitten text front end');
  const { loadPyodide } = await import(/* @vite-ignore */ PYODIDE_BASE + 'pyodide.mjs');
  pyodide = await loadPyodide({ indexURL: PYODIDE_BASE });
  await pyodide.loadPackage(['numpy', 'regex', 'micropip']);
  const small = Object.entries(KITTEN_FILES).filter(([p]) => !p.endsWith('.onnx'));
  const [wheels, src, files] = await Promise.all([
    Promise.all(KITTEN_WHEELS.map((w) => download(w.url, 'Loading the dictionary', w.sha256))),
    // vendored source files: same origin, not cached in CacheStorage so a site update is picked up
    Promise.all(KITTEN_FRONTEND_FILES.map((f) => download(KITTEN_FRONTEND_BASE + f, 'Loading the Kitten text front end', null, false))),
    Promise.all(small.map(([p, f]) => download(f.url, 'Loading the dictionary', f.sha256))),
  ]);
  status('Starting the Kitten text front end');
  const FS = pyodide.FS;
  FS.mkdirTree('/wheels'); FS.mkdirTree('/kfront-src/kfront');
  KITTEN_WHEELS.forEach((w, i) => FS.writeFile('/wheels/' + w.name, wheels[i]));
  KITTEN_FRONTEND_FILES.forEach((f, i) => FS.writeFile('/kfront-src/kfront/' + f, src[i]));
  small.forEach(([p], i) => { const d = (REPO + '/' + p).replace(/\/[^/]+$/, ''); FS.mkdirTree(d); FS.writeFile(REPO + '/' + p, files[i]); });
  const micropip = pyodide.pyimport('micropip');
  for (const w of KITTEN_WHEELS) await micropip.install.callKwargs('emfs:/wheels/' + w.name, { deps: false });
  pyodide.runPython(`
import json, sys
import numpy as np
sys.path.insert(0, "/kfront-src")
import kfront

def phonemize_json(text):
    return json.dumps(kfront.phonemize("${REPO}", text), ensure_ascii=False)

def voice_pack(key):
    with np.load("${REPO}/voices_en.npz") as z:
        a = z[key].astype(np.float32)
    return a.tobytes(), a.shape[0], a.shape[1]

phonemize_json("Warm up.")
`);
  phonemizeJson = pyodide.globals.get('phonemize_json');
  vocab = JSON.parse(new TextDecoder().decode(files[small.findIndex(([p]) => p === 'vocab.json')]));
}

function pack(key) {
  if (!packs[key]) {
    const fn = pyodide.globals.get('voice_pack'); const t = fn(key); const [bytes, rows, cols] = t.toJs(); t.destroy(); fn.destroy();
    packs[key] = { data: new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)), rows, cols };
  }
  return packs[key];
}

/**
 * ONNX Runtime Web's wasm build has no float64 Cast, and the exported graph runs one CumSum (the sine source's phase)
 * in float64: Cast(float->double) -> CumSum -> Cast(double->float). Rewrite the first Cast's `to` from DOUBLE (11) to
 * FLOAT (1) in place (same byte length), so the CumSum runs in float32. Measured in ONNX Runtime on CPU: durations
 * identical, waveform 36-38 dB SNR against the unpatched model, closer than two runs of the unpatched model
 * (27 dB; the model adds random noise). Returns a patched copy, or the input if the pattern is absent.
 */
export function patchDoubleCast(bytes) {
  // AttributeProto { name: "to", i: 11 }  =  0a 02 74 6f 18 0b
  const pat = [0x0a, 0x02, 0x74, 0x6f, 0x18, 0x0b], hits = [];
  outer: for (let i = 0; i + pat.length <= bytes.length; i++) {
    for (let j = 0; j < pat.length; j++) if (bytes[i + j] !== pat[j]) continue outer;
    hits.push(i);
  }
  if (hits.length !== 1) return bytes;
  const out = bytes.slice(); out[hits[0] + 5] = 0x01; return out;
}

async function loadModel() {
  ort = await importOrt();
  ort.env.wasm.numThreads = 1; ort.env.wasm.proxy = false; ort.env.logLevel = 'error';
  const f = KITTEN_FILES['kitten_tts_2_mini.onnx'];
  const bytes = await download(f.url, 'Downloading Kitten TTS 2 Mini (first time only)', f.sha256);
  status('Starting the model');
  session = await ort.InferenceSession.create(patchDoubleCast(bytes), { executionProviders: ['wasm'] });
}

/** Phoneme string -> token ids, as KittenTTS2Tiny._tokens. */
export function tokens(phonemes, vocabMap) {
  const ids = [];
  for (const ch of phonemes) { if (ch in vocabMap) ids.push(vocabMap[ch]); else if (ch === '(' || ch === ')') ids.push(vocabMap[',']); }
  return [0, ...ids, END_TOKEN, 0];
}

/** Trim the leading/trailing silence frames and fade, as KittenTTS2Tiny._chunk. */
export function trimChunk(wav, dur, keepStart) {
  let w = Float32Array.from(wav, (x) => Math.max(-1, Math.min(1, x)));
  let total = 0; for (const d of dur) total += Number(d);
  const spf = Math.max(1, Math.round(w.length / Math.max(total, 1)));
  const lead = keepStart ? 0 : Math.max(0, Number(dur[0]) - 1) * spf;
  const trail = Math.max(0, Number(dur[dur.length - 1]) - 1) * spf;
  if (lead + trail + spf < w.length) w = w.slice(lead, w.length - trail);
  const f = Math.min(120, Math.floor(w.length / 8));
  for (let i = 0; i < f; i++) { const g = f > 1 ? i / (f - 1) : 1; w[i] *= g; w[w.length - 1 - i] *= g; }
  return w;
}

async function chunk(phonemes, voice, speed, keepStart) {
  const tok = tokens(phonemes, vocab), p = pack(voice);
  const row = Math.min(tok.length - 1, p.rows - 1);
  const style = new ort.Tensor('float32', p.data.slice(row * p.cols, (row + 1) * p.cols), [1, p.cols]);
  const out = await session.run({ input_ids: new ort.Tensor('int64', BigInt64Array.from(tok.map(BigInt)), [1, tok.length]), style, speed: new ort.Tensor('float32', Float32Array.from([speed]), [1]) });
  return trimChunk(out.waveform.data, out.durations.data, keepStart);
}

async function speak({ id, text, voice = 'eleanor', speed = 1 }) {
  const t0 = performance.now();
  const ph = JSON.parse(phonemizeJson(text));
  if (!ph.chunks.length) { postMessage({ type: 'error', id, message: 'Kitten could not read that text (English only for now).' }); return; }
  const parts = [];
  for (let i = 0; i < ph.chunks.length; i++) { if (i) parts.push(new Float32Array(Math.round(GAP_S * SAMPLE_RATE))); parts.push(await chunk(ph.chunks[i], voice, speed, i === 0)); }
  const audio = new Float32Array(parts.reduce((a, c) => a + c.length, 0)); let o = 0; for (const c of parts) { audio.set(c, o); o += c.length; }
  limitPeak(audio);
  postMessage({ type: 'done', id, audio, sampleRate: SAMPLE_RATE, ms: performance.now() - t0, phonemes: ph.chunks.join(' | '), skipped: ph.skipped }, [audio.buffer]);
}

const ready = () => (loading ||= Promise.all([loadFrontend(), loadModel()]));
globalThis.onmessage = async ({ data }) => {
  try {
    if (data.type === 'load') { await ready(); postMessage({ type: 'ready', sampleRate: SAMPLE_RATE }); }
    else if (data.type === 'speak') { await ready(); await speak(data); }
  } catch (e) { loading = null; postMessage({ type: 'error', id: data.id, message: e?.message || String(e) }); }
};
