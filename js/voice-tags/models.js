/**
 * Voice-tag engines and the exact files they download.
 * Nothing here is stored in this repository except the small, Apache-2.0 / MIT code noted in THIRD_PARTY_NOTICES.md.
 *
 * - ZONOS3 Mini (Zyphra): code MIT (github.com/Zyphra/ZONOS3-Mini), weights Apache-2.0 (huggingface.co/Zyphra/ZONOS3-Mini).
 *   The WebGPU engine (vendor/zonos3-web, built from the MIT repo) loads the prebuilt web/ shards from the Hub at runtime.
 * - tiny-voca (n4ze3m): code and weights Apache-2.0. Phonemizer dizione Apache-2.0, dictionary from CMUdict (BSD-style).
 * - Kitten TTS 2 Mini (KittenML): code and weights Apache-2.0 (huggingface.co/KittenML/kitten-tts-2-mini, int8 ONNX).
 *   English front end: misaki (Apache-2.0) + CMUdict lexicon + a 0.75 M BART G2P (Apache-2.0), run in Pyodide.
 * - VoxMel (VoxDance-Lab): code and weights Apache-2.0, but trained on Emilia (CC BY-NC 4.0). Runs only on the user's
 *   own computer through tools/voxmel-server; nothing is downloaded by the page.
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

export const KITTEN_HF_REPO = 'KittenML/kitten-tts-2-mini';
export const KITTEN_HF_COMMIT = 'c01797caec3967b400da457656e011eb81f530a4';
const KT = `https://huggingface.co/${KITTEN_HF_REPO}/resolve/${KITTEN_HF_COMMIT}/`;
// path inside the repository -> pinned file. Total first download about 95 MB (the ONNX model is 82.7 MB).
export const KITTEN_FILES = {
  'kitten_tts_2_mini.onnx': { url: KT + 'kitten_tts_2_mini.onnx', bytes: 82711386, sha256: 'fa821c1cdd8f7fbfdbd5d1cae0a767673871d62696b85af7db059a9bd26b42d2' },
  'config.json': { url: KT + 'config.json', bytes: 16329, sha256: 'e6a63545213fbb677da62e1bc9946059033252bf61f57682b47cb6d8a54d0cbf' },
  'vocab.json': { url: KT + 'vocab.json', bytes: 1324, sha256: 'b007200ac2a7973ac25c509f8346815076b9d9f33758cb0bfe4de99e2f58f851' },
  'voices_en.npz': { url: KT + 'voices_en.npz', bytes: 5747328, sha256: '5c18573d075f53f6f218c2056dfc84ad10e976e81e23d55e5a7a6adc6e9135a4' },
  'g2p/cmu_misaki_us.json': { url: KT + 'g2p/cmu_misaki_us.json', bytes: 3418388, sha256: 'ae564e1a76df3501058a5ec99d135d016759c9475042fb6c3811374daee1ef04' },
  'g2p/g2p_bart_en_us/config.json': { url: KT + 'g2p/g2p_bart_en_us/config.json', bytes: 1257, sha256: '8deb3537fb29c63cd9f20d75515ae06e4c92f1b6db0703a2d45bca95b33a53a4' },
  'g2p/g2p_bart_en_us/model.safetensors': { url: KT + 'g2p/g2p_bart_en_us/model.safetensors', bytes: 3011692, sha256: 'dc4a02e62d4fcb4bb4097ecf00db89b8e1a12a549a52ab6adfbba220b80a55c5' },
};
// Pure-Python wheels for the front end, from PyPI (immutable files), SHA-256 checked before install.
export const KITTEN_WHEELS = [
  { name: 'addict-2.4.0-py3-none-any.whl', url: 'https://files.pythonhosted.org/packages/6a/00/b08f23b7d7e1e14ce01419a467b583edbb93c6cdb8654e54a9cc579cd61f/addict-2.4.0-py3-none-any.whl', sha256: '249bb56bbfd3cdc2a004ea0ff4c2b6ddc84d53bc2194761636eb314d5cfa5dfc' },
  { name: 'num2words-0.5.14-py3-none-any.whl', url: 'https://files.pythonhosted.org/packages/d6/5b/545e9267a1cc080c8a1be2746113a063e34bcdd0f5173fd665a5c13cb234/num2words-0.5.14-py3-none-any.whl', sha256: '1c8e5b00142fc2966fd8d685001e36c4a9911e070d1b120e1beb721fa1edb33d' },
  { name: 'misaki-0.9.4-py3-none-any.whl', url: 'https://files.pythonhosted.org/packages/82/ec/0ee4110ddb54278b8f21c40a140370ae8f687036c4edf578316602697c56/misaki-0.9.4-py3-none-any.whl', sha256: '90e2eeb169786c014c429e5058d2ea6bcd02d651f2a24450ba6c9ffc0f8da15a' },
];
export const KITTEN_FRONTEND_BASE = new URL('./vendor/kitten-frontend/kfront/', import.meta.url).href;
export const KITTEN_FRONTEND_FILES = ['__init__.py', 'spacy_stub.py', 'bart_np.py', 'english.py', 'tts_norm.py', 'phonemize_v1.py', 'phonemize_v2.py', 'frontend_init.py'];
export const KITTEN_VOICES = [
  { id: 'eleanor', label: 'Eleanor (female, somber)' }, { id: 'martha', label: 'Martha (female, radio journalist)' },
  { id: 'serena', label: 'Serena (female, gentle)' }, { id: 'iris', label: 'Iris (female, hushed)' },
  { id: 'grace', label: 'Grace (female, soothing)' }, { id: 'edith', label: 'Edith (female, elderly)' },
  { id: 'diana', label: 'Diana (female, stern)' }, { id: 'otis', label: 'Otis (male, rumbling)' },
  { id: 'vincent', label: 'Vincent (male, hushed)' }, { id: 'max', label: 'Max (male, sports announcer)' },
  { id: 'danny', label: 'Danny (male, podcast host)' },
];

export const VOXMEL_GIT = 'VoxDance-Lab/VoxMel';
export const VOXMEL_GIT_COMMIT = '1b0bc1cc63155b0197825178e896b63f7c0c554c';
export const VOXMEL_LOCAL_DEFAULT = 'http://127.0.0.1:1920';

export const ENGINES = [
  { id: 'zonos3', label: 'ZONOS3 Mini', blurb: 'Most natural voice, many speakers. Needs WebGPU (desktop Chrome / Edge with a real GPU). About 1 GB the first time, then cached.', license: 'Code MIT, weights Apache-2.0 (Zyphra)' },
  { id: 'tinyvoca', label: 'tiny-voca', blurb: 'Light and fast, runs on any CPU. Two voices. About 27 MB the first time.', license: 'Code and weights Apache-2.0 (n4ze3m)' },
  { id: 'kitten', label: 'Kitten TTS 2 Mini', blurb: 'Clear, expressive voices on any CPU, no GPU needed. Eleven English voices. About 95 MB the first time, then cached.', license: 'Code and weights Apache-2.0 (KittenML)' },
];
