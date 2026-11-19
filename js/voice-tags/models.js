/**
 * Voice-tag engines and the exact files they download.
 * Nothing here is stored in this repository except the small, Apache-2.0 / MIT code noted in THIRD_PARTY_NOTICES.md.
 *
 * - ZONOS3 Mini (Zyphra): code MIT (github.com/Zyphra/ZONOS3-Mini), weights Apache-2.0 (huggingface.co/Zyphra/ZONOS3-Mini).
 *   The WebGPU engine (vendor/zonos3-web, built from the MIT repo) loads the prebuilt web/ shards from the Hub at runtime.
 * - tiny-voca (n4ze3m): code and weights Apache-2.0. Phonemizer dizione Apache-2.0, dictionary from CMUdict (BSD-style).
 */
export const ZONOS3_HF_REPO = 'Zyphra/ZONOS3-Mini';
export const ZONOS3_HF_COMMIT = 'd2d142a86b1e6aeb4252679673c86ecd86177bf8';
export const ZONOS3_GIT_COMMIT = '96d9e0ec1e39083ed336ac78f24e3dbc93721c0f';
export const ZONOS3_MODELS_BASE = `https://huggingface.co/${ZONOS3_HF_REPO}/resolve/${ZONOS3_HF_COMMIT}/web/`;
export const ZONOS3_FIRST_LOAD_BYTES = 1.0e9; // backbone + zac (keep2) per the engine README

export const TINYVOCA_HF_REPO = 'n4ze3m/tiny-voca';
export const TINYVOCA_HF_COMMIT = 'eac048b7a4392584725af9792460a0211fa1cac7';
const TV = `https://huggingface.co/${TINYVOCA_HF_REPO}/resolve/${TINYVOCA_HF_COMMIT}/`;
export const TINYVOCA_FILES = {
  model: { url: TV + 'onnx/model.onnx', bytes: 21386372, sha256: 'fe6d918791a15b82e37465981d7f27a070e46b46635e5a3482fc8dff87a1ae46' },
  config: { url: TV + 'config.json', bytes: 2129, sha256: '27bcbf322fc428581f0e959be1c141dd7751c61f4fed5eded326e779b215f69c' },
  phonemizer: {
    'lexicon.tsv': { url: TV + 'phonemizer/lexicon.tsv', sha256: '3fc930345c6b3cabc533981c4b212fa309eec83913fcdbd42919338270d64b06' },
    'align.json': { url: TV + 'phonemizer/align.json', sha256: '864763dbd558a864950266b2c30627f1cad203e75062ee842ee63c653e823b75' },
    'g2p.json': { url: TV + 'phonemizer/g2p.json', sha256: 'c518fd839ea0109c0b2b4f778c17506bf0d7653557b8b8c97a4c8dd9883d4432' },
    'g2p.npz': { url: TV + 'phonemizer/g2p.npz', sha256: 'eb3fd519ff00e72d850928d2fccb968adc36134bca2f3bda09de7e794c2ed01b' },
    'homographs.json': { url: TV + 'phonemizer/homographs.json', sha256: '9c3a96fcdf79fa27d1b3686dc6a507c37e4f754966928608ee9ddb617ba39192' },
  },
};
export const TINYVOCA_VOICES = [{ id: 0, name: 'F2', label: 'F2 (female)' }, { id: 1, name: 'M2', label: 'M2 (male)' }];
// Pyodide runs the Python phonemizer; loaded from jsDelivr like the upstream tiny-voca demo (MPL-2.0, not bundled).
export const PYODIDE_BASE = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';
export const DIZIONE_ZIP = new URL('./vendor/dizione/dizione-0.1.0.zip', import.meta.url).href;

export const ENGINES = [
  { id: 'zonos3', label: 'ZONOS3 Mini', blurb: 'Most natural voice, many speakers. Needs WebGPU (desktop Chrome / Edge with a real GPU). About 1 GB the first time, then cached.', license: 'Code MIT, weights Apache-2.0 (Zyphra)' },
  { id: 'tinyvoca', label: 'tiny-voca', blurb: 'Light and fast, runs on any CPU. Two voices. About 27 MB the first time.', license: 'Code and weights Apache-2.0 (n4ze3m)' },
];
