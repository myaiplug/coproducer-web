/**
 * Module worker: Inflect Mini v3 (Owen Song, code and weights Apache-2.0) on the CPU, for the Stem Studio guide voice.
 * Text front end: the Kitten/misaki English front end from Voice Tags (Pyodide, js/voice-tags/vendor/kitten-frontend),
 * with Inflect's phoneme vocab. Model: tools/inflect-export ONNX graphs on ONNX Runtime Web (wasm).
 * in : {type:'load', base} | {type:'speak', id, text, voice}
 * out: {type:'status', text, progress} | {type:'ready', sampleRate} | {type:'done', id, audio, sampleRate, ms, phonemes} | {type:'error', id?, message}
 */
import { ORT_MODULE_URL, ORT_WASM_BASE, ORT_CDN_MODULE_URL, ORT_CDN_BASE } from '../roformer-web/models.js';
import { KITTEN_FILES, KITTEN_WHEELS, KITTEN_FRONTEND_BASE, KITTEN_FRONTEND_FILES, PYODIDE_BASE } from '../voice-tags/models.js';
import { INFLECT_ONNX_FILES, INFLECT_META_URL, INFLECT_SAMPLE_RATE } from './models.js';
import { tokens, frameCounts, alignment, styleRow } from './inflect-core.js';
import { download } from './fetch-cache.js';

const CACHE = 'guide-voice-inflect-v1', KCACHE = 'voice-tags-kitten-v1';
const REPO = '/inflect-repo', KREPO = '/kitten-repo', GAP_S = 0.12;
let ort, pyodide, phonemizeJson, text, decode, meta, styles, affines, loading = null;
const status = (t, progress) => postMessage({ type: 'status', text: t, progress });

async function importOrt() {
  try { const m = await import(/* @vite-ignore */ ORT_MODULE_URL); m.env.wasm.wasmPaths = ORT_WASM_BASE; return m; }
  catch { const m = await import(/* @vite-ignore */ ORT_CDN_MODULE_URL); m.env.wasm.wasmPaths = ORT_CDN_BASE; return m; }
}

async function loadFrontend() {
  status('Loading the text front end');
  const { loadPyodide } = await import(/* @vite-ignore */ PYODIDE_BASE + 'pyodide.mjs');
  pyodide = await loadPyodide({ indexURL: PYODIDE_BASE });
  await pyodide.loadPackage(['numpy', 'regex', 'micropip']);
  const g2p = Object.entries(KITTEN_FILES).filter(([p]) => p.startsWith('g2p/'));
  const [wheels, src, files, metaBytes] = await Promise.all([
    Promise.all(KITTEN_WHEELS.map((w) => download(w.url, { cacheName: KCACHE, sha256: w.sha256 }))),
    Promise.all(KITTEN_FRONTEND_FILES.map((f) => download(KITTEN_FRONTEND_BASE + f, { cache: false }))),
    Promise.all(g2p.map(([, f]) => download(f.url, { cacheName: KCACHE, sha256: f.sha256 }))),
    download(INFLECT_META_URL, { cache: false }),
  ]);
  meta = JSON.parse(new TextDecoder().decode(metaBytes));
  const FS = pyodide.FS;
  FS.mkdirTree('/wheels'); FS.mkdirTree('/kfront-src/kfront'); FS.mkdirTree(REPO);
  KITTEN_WHEELS.forEach((w, i) => FS.writeFile('/wheels/' + w.name, wheels[i]));
  KITTEN_FRONTEND_FILES.forEach((f, i) => FS.writeFile('/kfront-src/kfront/' + f, src[i]));
  g2p.forEach(([p], i) => { const d = (KREPO + '/' + p).replace(/\/[^/]+$/, ''); FS.mkdirTree(d); FS.writeFile(KREPO + '/' + p, files[i]); });
  FS.writeFile(REPO + '/vocab.json', JSON.stringify(meta.vocab));
  FS.writeFile(REPO + '/config.json', JSON.stringify({ phonemizer: 'v1', vocab: 'vocab.json', g2p_dir: KREPO + '/g2p' }));
  const micropip = pyodide.pyimport('micropip');
  for (const w of KITTEN_WHEELS) await micropip.install.callKwargs('emfs:/wheels/' + w.name, { deps: false });
  pyodide.runPython(`
import json, sys
sys.path.insert(0, "/kfront-src")
import kfront
def phonemize_json(text):
    return json.dumps(kfront.phonemize("${REPO}", text), ensure_ascii=False)
phonemize_json("Warm up.")
`);
  phonemizeJson = pyodide.globals.get('phonemize_json');
}

async function loadModel(base) {
  ort = await importOrt();
  ort.env.wasm.numThreads = Math.min(4, navigator.hardwareConcurrency || 1); ort.env.wasm.proxy = false; ort.env.logLevel = 'error';
  const names = Object.keys(INFLECT_ONNX_FILES), sizes = names.map((n) => INFLECT_ONNX_FILES[n].bytes), all = sizes.reduce((a, b) => a + b, 0);
  const got = names.map(() => 0);
  const bufs = await Promise.all(names.map((n, i) => download(base + n, { cacheName: CACHE, sha256: INFLECT_ONNX_FILES[n].sha256,
    onProgress: (p) => { got[i] = p * sizes[i]; status('Downloading the guide voice (first time only)', got.reduce((a, b) => a + b, 0) / all); } })));
  const f = Object.fromEntries(names.map((n, i) => [n, bufs[i]]));
  status('Starting the guide voice');
  const opt = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' };
  text = await ort.InferenceSession.create(f['text_w16.onnx'], opt);
  decode = await ort.InferenceSession.create(f['decode_w16.onnx'], opt);
  const fl = (b) => new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
  styles = fl(f['voice_styles_f32.bin']); affines = fl(f['voice_affines_f32.bin']);
}

async function chunk(phonemes, sid) {
  const ids = tokens(phonemes, meta.vocab), T = ids.length;
  const tok = new ort.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, T]), s = new ort.Tensor('int64', BigInt64Array.from([BigInt(sid)]), [1]);
  const r = await text.run({ tokens: tok, sid: s });
  const { counts } = frameCounts(r.dur.data, meta.max_frames), al = alignment(counts);
  const A = affines.length / meta.voices.length;
  const out = await decode.run({ feat: r.feat, asr_tok: r.asr_tok, aln: new ort.Tensor('float32', al.data, [1, T, al.F]), sid: s,
    style: new ort.Tensor('float32', styleRow(styles, sid, T).slice(), [1, 128]), affine: new ort.Tensor('float32', affines.slice(sid * A, (sid + 1) * A), [A]) });
  return out.audio.data;
}

async function speak({ id, text: input, voice = 'hope' }) {
  const t0 = performance.now(), sid = Math.max(0, meta.voices.indexOf(voice));
  const ph = JSON.parse(phonemizeJson(input));
  if (!ph.chunks.length) { postMessage({ type: 'error', id, message: 'The guide voice could not read that text (English only).' }); return; }
  const parts = [];
  for (let i = 0; i < ph.chunks.length; i++) { if (i) parts.push(new Float32Array(Math.round(GAP_S * INFLECT_SAMPLE_RATE))); parts.push(await chunk(ph.chunks[i], sid)); }
  const audio = new Float32Array(parts.reduce((a, c) => a + c.length, 0)); let o = 0; for (const c of parts) { audio.set(c, o); o += c.length; }
  let m = 0; for (const x of audio) m = Math.max(m, Math.abs(x)); if (m > 0.99) for (let i = 0; i < audio.length; i++) audio[i] *= 0.99 / m;
  postMessage({ type: 'done', id, audio, sampleRate: INFLECT_SAMPLE_RATE, ms: performance.now() - t0, phonemes: ph.chunks.join(' | ') }, [audio.buffer]);
}

globalThis.onmessage = async ({ data }) => {
  try {
    if (data.type === 'load') { await (loading ||= Promise.all([loadFrontend(), loadModel(data.base)])); postMessage({ type: 'ready', sampleRate: INFLECT_SAMPLE_RATE }); }
    else if (data.type === 'speak') { if (!loading) throw new Error('not loaded'); await loading; await speak(data); }
  } catch (e) { loading = null; postMessage({ type: 'error', id: data.id, message: e?.message || String(e) }); }
};
