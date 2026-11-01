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

## Stem Studio (per-stem effects, loudness, artifact repair, deeper drum split)

`stem-studio.html` + `js/stem-studio/`: split a track in the browser, then give every stem its own effect chain (156 presets over 15 stem types, extracted from the Liminal desktop app), BS.1770-4 LUFS / true-peak metering, artifact detection and one-click repair, a deeper drum split (kick / snare / toms / hats / crash-ride / 808) and 24-bit/float WAV, MP3 or ZIP export tagged "Made with NoDAW CoProducer". Everything runs on-device. Docs: `docs/stem-studio-presets.md`, `docs/stem-studio-drums.md`. Unit tests: `node --test js/stem-studio/test/*.test.mjs`. Browser tests live in the Liminal repo (`scripts/e2e-stem-studio`).

## Try in-browser stem splitting (live preview)

**https://coproducer-stems.vercel.app/stems.html** — a separate Vercel preview project built from this branch (static files only; the production GitHub Pages site is untouched, `main` is unchanged).

* The page shows a live progress experience while you wait: one stepper (Read audio → Get model → Start engine → Separate → Done), model download bytes / MB/s / ETA, chunk x of y, a live waveform of your track you can scrub, stems that light up as they are produced (tap one to hear an early preview), and rotating mixing tips that link to the Lacquer essays. Leaving the tab is guarded (`beforeunload`), the tab title shows the %, an optional "notify me when done" toggle asks for notification permission only when you tick it, and downloads resume from OPFS if you do leave.
* Preview hosting: `scripts/stage-stem-demo.mjs` stages `stems.html` + `js/roformer-web` into `dist-stem-demo/`; `vercel-stem-demo/vercel.json` sets COOP `same-origin` / COEP `credentialless` (multi-threaded WASM), `noindex`, wasm caching, and redirects every other path back to the live GitHub Pages site. Redeploy: `node scripts/stage-stem-demo.mjs && cd dist-stem-demo && vercel link --project coproducer-stems --scope nodawlabs --yes && vercel deploy --prod --yes --scope nodawlabs`.
