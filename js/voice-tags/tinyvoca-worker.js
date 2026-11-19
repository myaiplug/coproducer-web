/**
 * Module worker: tiny-voca text-to-speech (n4ze3m, Apache-2.0) on the CPU.
 * Phonemizer: dizione (Apache-2.0) in Pyodide. Model: ONNX Runtime Web (wasm), vendored with the stem splitter.
 * Adapted from the tiny-voca web demo (web/public/worker.js, Apache-2.0).
 * in : {type:'load'} | {type:'speak', id, text, voice, speed}
 * out: {type:'status', text, progress} | {type:'ready', voices, sampleRate} | {type:'done', id, audio, sampleRate, ms} | {type:'error', id?, message}
 */
import { ORT_MODULE_URL, ORT_WASM_BASE, ORT_CDN_MODULE_URL, ORT_CDN_BASE } from '../roformer-web/models.js';
import { TINYVOCA_FILES, PYODIDE_BASE, DIZIONE_ZIP } from './models.js';
import { sentences, finished, fit } from './text.js';
import { limitPeak, sha256Hex } from './audio.js';

const CACHE = 'voice-tags-tinyvoca-v1';
let ort, pyodide, phonemizeJson, session, config, loading = null;
const status = (text, progress) => postMessage({ type: 'status', text, progress });

async function importOrt() {
  try { const m = await import(/* @vite-ignore */ ORT_MODULE_URL); m.env.wasm.wasmPaths = ORT_WASM_BASE; return m; }
  catch { const m = await import(/* @vite-ignore */ ORT_CDN_MODULE_URL); m.env.wasm.wasmPaths = ORT_CDN_BASE; return m; }
}

async function download(url, label, sha256) {
  let store = null;
  try { store = await caches.open(CACHE); const hit = await store.match(url); if (hit) return new Uint8Array(await hit.arrayBuffer()); } catch { store = null; }
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

async function loadPhonemizer() {
  status('Loading the phonemizer');
  const { loadPyodide } = await import(/* @vite-ignore */ PYODIDE_BASE + 'pyodide.mjs');
  pyodide = await loadPyodide({ indexURL: PYODIDE_BASE });
  await pyodide.loadPackage('numpy');
  const names = Object.keys(TINYVOCA_FILES.phonemizer);
  const [source, ...files] = await Promise.all([
    download(DIZIONE_ZIP, 'Loading the phonemizer'),
    ...names.map((n) => download(TINYVOCA_FILES.phonemizer[n].url, 'Loading the dictionary', TINYVOCA_FILES.phonemizer[n].sha256)),
  ]);
  status('Starting the phonemizer');
  pyodide.FS.mkdirTree('/dizione-data');
  names.forEach((n, i) => pyodide.FS.writeFile('/dizione-data/' + n, files[i]));
  pyodide.unpackArchive(source.buffer, 'zip', { extractDir: '/dizione-src' });
  pyodide.runPython(`
import json, os, sys
os.environ["DIZIONE_DATA"] = "/dizione-data"
sys.path.insert(0, "/dizione-src")
import dizione

def phonemize_json(text):
    try:
        result = dizione.phonemize(text)
    except ValueError:
        if any(word for mark, words in dizione.pieces(text) if not mark for word in words):
            raise
        return "null"
    return json.dumps({"ids": list(result.ids), "stress": list(result.stress), "text": str(result)})

phonemize_json("Warm up.")
`);
  phonemizeJson = pyodide.globals.get('phonemize_json');
}

async function loadModel() {
  ort = await importOrt();
  ort.env.wasm.numThreads = 1; ort.env.wasm.proxy = false; ort.env.logLevel = 'error';
  config = JSON.parse(new TextDecoder().decode(await download(TINYVOCA_FILES.config.url, 'Loading the model', TINYVOCA_FILES.config.sha256)));
  const bytes = await download(TINYVOCA_FILES.model.url, 'Loading the model', TINYVOCA_FILES.model.sha256);
  status('Starting the model');
  session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
}

async function synthesize(phones, voice, speed) {
  const n = phones.ids.length;
  const ints = (a) => new ort.Tensor('int64', BigInt64Array.from(a.map(BigInt)), [1, n]);
  const scalar = (v) => new ort.Tensor('float32', Float32Array.from([v]), [1]);
  const out = await session.run({ tokens: ints(phones.ids), stress: ints(phones.stress), voice: new ort.Tensor('int64', BigInt64Array.from([BigInt(voice)]), [1]), speed: scalar(speed), pitch_shift: scalar(0), pitch_range: scalar(1) });
  return out.audio.data;
}

async function speak({ id, text, voice = 0, speed = 1 }) {
  const t0 = performance.now(), chunks = [];
  const phon = (s) => JSON.parse(phonemizeJson(s));
  for (const s of sentences(finished(text))) for (const p of fit(s, phon, config.model.max_tokens)) chunks.push(await synthesize(p, voice, speed));
  if (!chunks.length) { postMessage({ type: 'error', id, message: 'tiny-voca only reads English for now.' }); return; }
  const audio = new Float32Array(chunks.reduce((a, c) => a + c.length, 0)); let o = 0; for (const c of chunks) { audio.set(c, o); o += c.length; }
  limitPeak(audio);
  postMessage({ type: 'done', id, audio, sampleRate: config.sample_rate, ms: performance.now() - t0 }, [audio.buffer]);
}

onmessage = async ({ data }) => {
  try {
    if (data.type === 'load') { await (loading ||= Promise.all([loadPhonemizer(), loadModel()])); postMessage({ type: 'ready', voices: config.voices, sampleRate: config.sample_rate }); }
    else if (data.type === 'speak') { await (loading ||= Promise.all([loadPhonemizer(), loadModel()])); await speak(data); }
  } catch (e) { loading = null; postMessage({ type: 'error', id: data.id, message: e?.message || String(e) }); }
};
