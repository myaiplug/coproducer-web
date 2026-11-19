/**
 * Voice commands: Earlybird-29M (Sahil Mahendrakar), code and weights MIT, built on Moonshine streaming tiny (MIT,
 * Useful Sensors). The page downloads the published 4-bit weights file from Hugging Face at a pinned commit (16.8 MB,
 * SHA-256 checked) and unpacks it in the browser; nothing of the model is re-hosted. The two small ONNX graphs in
 * ./model hold the network structure only (tools/earlybird-export); their big weights come from that file.
 */
export const EARLYBIRD_HF_REPO = 'sahilmahendrakar/Earlybird-29M';
export const EARLYBIRD_HF_COMMIT = 'b24d6bd6b92ab2a0ef31e438b775662d495c0860';
export const EARLYBIRD_LICENSE = 'Code and weights MIT (Earlybird-29M, built on Moonshine, MIT)';
export const EARLYBIRD_WEIGHTS = {
  url: `https://huggingface.co/${EARLYBIRD_HF_REPO}/resolve/${EARLYBIRD_HF_COMMIT}/earlybird.safetensors`,
  bytes: 16786038, sha256: 'ef56c731f5270515e27f2fbd32a95b86b47b34874a58fccd1800d4f154695be2',
};
// SHA-256 of the unpacked external-data buffers (equal to the Python unpacker's output, see the test).
export const EXTERNAL_SHA256 = {
  encoder: 'c0d6a692194f082544f69a90341797a47b608f71f21e3a0bb20712b39696dd21',
  decoder: 'a393913b8aa3688bd3829640ff0aeb394cfc6917c8329eee4e41bec81ddb913a',
};
export const MODEL_BASE = new URL('./model/', import.meta.url).href;
export const SAMPLE_RATE = 16000;
export const MIN_SECONDS = 0.24, MAX_SECONDS = 6;
// Decision rule (tools/earlybird-export/eval_ort.py): accept the best grammar phrase if its log-prob is within
// MARGIN of the free transcript's, or the transcript is within MAX_DIST (normalised edit distance) of it.
export const DECISION = { topK: 8, margin: 12, maxDist: 0.3 };
