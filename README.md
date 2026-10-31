# CoProducer Web

Marketing site, Lacquer journal, ScrewAI / StemSplit demos, and NoDAW product suite.

**Live:** https://myaiplug.github.io/coproducer-web/

Local preview: `py -3.11 -m http.server 5505` from this folder.
Analyze projection API stays on a separate local engine (not GitHub Pages).

## Stem split in the browser (`stems.html`)

`stems.html` runs three RoFormer ONNX models fully client-side with onnxruntime-web (WebGPU, WASM fallback) in a Web Worker.
No server, no upload. Everything the page needs is in this repo except the model weights, which download from Hugging Face
on first use (pinned, SHA-256 verified, Range-resumable) and are kept in the browser's OPFS storage.

* **Runtime vendored:** onnxruntime-web 1.30.0 under `js/roformer-web/vendor/ort/` (~27 MB, wasm included; jsDelivr is only a fallback), fflate for ZIP export.
* **One service worker** (`stems-sw.js`, registered from `stems.html` only) does two jobs: it adds COOP/COEP to the stems page and its module/worker/wasm files so
  GitHub Pages serves cross-origin-isolated (multi-threaded WASM; the first visit reloads once), and it caches the page + runtime so the tool works offline after first use.
  It does not touch any other page, third-party request, font or embed. Safari (no `COEP: credentialless`) falls back to single-threaded WASM.
* Code: `js/roformer-web/` (config in `models.js`). Notices: `THIRD_PARTY_NOTICES.md`.
* Test it: `python3 -m http.server 5505`, open http://localhost:5505/stems.html in Chrome/Edge (no special headers needed). Unit tests: `node --test js/roformer-web.test.mjs`.
