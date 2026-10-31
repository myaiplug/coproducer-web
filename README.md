# CoProducer Web

Marketing site, Lacquer journal, ScrewAI / StemSplit demos, and NoDAW product suite.

**Live:** https://myaiplug.github.io/coproducer-web/

Local preview: `py -3.11 -m http.server 5505` from this folder.
Analyze projection API stays on a separate local engine (not GitHub Pages).

## Stem split in the browser (`stems.html`)

`stems.html` runs three RoFormer ONNX models fully client-side with onnxruntime-web (WebGPU, WASM fallback) in a Web Worker.
No server, no upload. Models are not in this repo: they download from Hugging Face on first use (pinned + SHA-256 verified)
and are cached in the browser. Code: `js/roformer-web/` (config in `models.js`). Notices: `THIRD_PARTY_NOTICES.md`.
Test it: `python3 -m http.server 5505`, open http://localhost:5505/stems.html in Chrome/Edge. GitHub Pages cannot send
COOP/COEP headers, so the CPU fallback is single-threaded there.
