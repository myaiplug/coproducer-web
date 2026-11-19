/**
 * Guide voice: Inflect Mini v3 (Owen Song). Code and weights Apache-2.0 (LICENSING.md and core/LICENSE_SCOPE.json in
 * huggingface.co/owensong/Inflect-Mini-v3 at the commit below). Derived from Kokoro (Apache-2.0) and StyleTTS 2 (MIT).
 *
 * Two ways it speaks:
 *  1. Built-in clips (always on): the tips and command confirmations in lines.json, pre-rendered on a CPU with Inflect's
 *     own runtime (tools/inflect-export/render_clips.py) to 48 kb/s MP3 in ./clips. About 1 MB, no model download.
 *  2. Live engine (opt-in, off until INFLECT_ONNX_BASE is set): the same model exported to ONNX (tools/inflect-export),
 *     weights stored as float16 (fp32 compute), run on ONNX Runtime Web (wasm, CPU). About 71 MB the first time, cached.
 *     The text front end is the Kitten/misaki front end already used by Voice Tags (Pyodide), with Inflect's vocab.
 *     Upstream publishes no ONNX files, so they need a host we control; until one is chosen the live engine is disabled.
 *     Testing: stem-studio.html?inflectbase=<url ending in />.
 */
export const INFLECT_HF_REPO = 'owensong/Inflect-Mini-v3';
export const INFLECT_HF_COMMIT = '0490aee6a9c66f9375b48287a2c5e5788afd00cc';
export const INFLECT_LICENSE = 'Code and weights Apache-2.0 (Owen Song)';
export const INFLECT_ONNX_BASE = '';   // e.g. a GitHub release or HF repo /resolve/<commit>/ URL; '' = live engine off
export const INFLECT_VOICE = 'hope';
export const INFLECT_SAMPLE_RATE = 24000;
// Files produced by tools/inflect-export (export.py then fp16w.py) from the commit above. SHA-256 checked before use.
export const INFLECT_ONNX_FILES = {
  'text_w16.onnx': { bytes: 14630960, sha256: '83eeffdf7ab876ae8cc74e8360c1a0156a0c9d3b48a09833ec910b4e2b432afc' },
  'decode_w16.onnx': { bytes: 54377179, sha256: 'b4ef26fd66808adb88205b1f8729aadba6ae4d36de6d8f1ec36f9dfe9d461ae5' },
  'voice_styles_f32.bin': { bytes: 1566720, sha256: 'bd233a1d896b56d9fea5254b7bf0ec9fb031d927b1ef2aa69cdcf81dcca002aa' },
  'voice_affines_f32.bin': { bytes: 442368, sha256: 'f77738fa6ab3a51defaa0edfc055233e5a417c42955f3f53fb541a8b864633a5' },
};
export const INFLECT_META_URL = new URL('./inflect_meta.json', import.meta.url).href;
export const CLIPS_BASE = new URL('./clips/', import.meta.url).href;

/** The live-engine base URL: ?inflectbase= (testing) wins over the constant. Must end in '/'. */
export function inflectBase(search = globalThis.location?.search || '') {
  const q = new URLSearchParams(search).get('inflectbase');
  const b = q || INFLECT_ONNX_BASE;
  if (!b) return '';
  return b.endsWith('/') ? b : b + '/';
}
