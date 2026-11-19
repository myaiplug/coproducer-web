/**
 * Module worker: Earlybird-29M (MIT) push-to-talk command recognition on the CPU (ONNX Runtime Web, wasm).
 * Whole utterance at once: encoder -> greedy transcript -> rescore the nearest grammar phrases -> accept rule.
 * in : {type:'load'} | {type:'recognise', id, audio (Float32Array, 16 kHz mono)}
 * out: {type:'status', text, progress} | {type:'ready'} | {type:'result', id, text, command, ms, cands} | {type:'error', id?, message}
 */
import { ORT_MODULE_URL, ORT_WASM_BASE, ORT_CDN_MODULE_URL, ORT_CDN_BASE } from '../roformer-web/models.js';
import { EARLYBIRD_WEIGHTS, EXTERNAL_SHA256, MODEL_BASE, SAMPLE_RATE, MIN_SECONDS, DECISION } from './models.js';
import { parseSafetensors, buildExternal } from './unpack.js';
import { detok, nearest, logSoftmaxRow, decide } from './grammar.js';
import { download, sha256Hex } from '../guide-voice/fetch-cache.js';

const CACHE = 'voice-commands-earlybird-v1';
let ort, enc, dec, G, VOC, V, loading = null;
const status = (text, progress) => postMessage({ type: 'status', text, progress });

async function importOrt() {
  try { const m = await import(/* @vite-ignore */ ORT_MODULE_URL); m.env.wasm.wasmPaths = ORT_WASM_BASE; return m; }
  catch { const m = await import(/* @vite-ignore */ ORT_CDN_MODULE_URL); m.env.wasm.wasmPaths = ORT_CDN_BASE; return m; }
}

async function load() {
  ort = await importOrt();
  ort.env.wasm.numThreads = Math.min(2, navigator.hardwareConcurrency || 1); ort.env.wasm.proxy = false; ort.env.logLevel = 'error';
  const get = (f) => download(MODEL_BASE + f, { cache: false });
  const [w, eg, dg, em, dm, cmd, voc] = await Promise.all([
    download(EARLYBIRD_WEIGHTS.url, { cacheName: CACHE, sha256: EARLYBIRD_WEIGHTS.sha256, onProgress: (p) => status('Downloading the voice-command model (17 MB, first time only)', p) }),
    get('encoder_graph.onnx'), get('decoder_graph.onnx'), get('encoder_weights.json'), get('decoder_weights.json'), get('commands.json'), get('vocab.json')]);
  const js = (b) => JSON.parse(new TextDecoder().decode(b));
  G = js(cmd); VOC = js(voc); V = VOC.length;
  status('Unpacking the model');
  const st = parseSafetensors(w), cache = new Map();
  const ex = { encoder: buildExternal(w, st, js(em), cache), decoder: buildExternal(w, st, js(dm), cache) }; cache.clear();
  for (const k of ['encoder', 'decoder']) if ((await sha256Hex(ex[k])) !== EXTERNAL_SHA256[k]) throw new Error(`unpacked ${k} weights do not match`);
  status('Starting the voice-command model');
  const opt = (k) => ({ executionProviders: ['wasm'], externalData: [{ path: `${k}.weights.bin`, data: ex[k] }] });
  enc = await ort.InferenceSession.create(eg, opt('encoder'));
  dec = await ort.InferenceSession.create(dg, opt('decoder'));
}

async function decode(ids, mem) {
  const r = await dec.run({ ids: new ort.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]), mem });
  return r.logits.data; // [1, L, V]
}

async function recognise({ id, audio }) {
  const t0 = performance.now();
  if (audio.length / SAMPLE_RATE < MIN_SECONDS) { postMessage({ type: 'result', id, text: '', command: null, ms: 0, cands: [] }); return; }
  const mem = (await enc.run({ audio: new ort.Tensor('float32', audio, [1, audio.length]) })).mem;
  const toks = []; let lp = 0; const maxNew = Math.floor(audio.length / SAMPLE_RATE * 6.5) + 4;
  while (toks.length < maxNew) {
    const lg = await decode([G.bos, ...toks], mem), row = logSoftmaxRow(lg, toks.length * V, V);
    let t = 0; for (let j = 1; j < V; j++) if (lg[toks.length * V + j] > lg[toks.length * V + t]) t = j;
    lp += row(t); if (t === G.eos) break; toks.push(t);
  }
  const text = detok(toks, VOC), cands = [];
  for (const { dist, i } of nearest(text, G.phrases, DECISION.topK)) {
    let best = -1e9;
    for (const f of G.phrases[i].forms) {
      const lg = await decode([G.bos, ...f], mem), seq = [...f, G.eos]; let s = 0;
      for (let k = 0; k < seq.length; k++) s += logSoftmaxRow(lg, k * V, V)(seq[k]);
      best = Math.max(best, s);
    }
    cands.push({ score: best, dist, i });
  }
  cands.sort((a, b) => b.score - a.score);
  const command = decide(cands, lp, G.phrases, DECISION);
  postMessage({ type: 'result', id, text, lp, command, ms: performance.now() - t0, cands: cands.slice(0, 3).map((c) => ({ ...c, text: G.phrases[c.i].text })) });
}

globalThis.onmessage = async ({ data }) => {
  try {
    if (data.type === 'load') { await (loading ||= load()); postMessage({ type: 'ready' }); }
    else if (data.type === 'recognise') { await (loading ||= load()); await recognise(data); }
  } catch (e) { loading = null; postMessage({ type: 'error', id: data.id, message: e?.message || String(e) }); }
};
