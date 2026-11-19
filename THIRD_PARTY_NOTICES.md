# Third-party notices

Uses soundkit / mel-spec by wavey-ai (MIT). Uses mfcc-rust by wavey-ai (Apache-2.0).

| Component | Source | Version / commit | License | Location |
| --- | --- | --- | --- | --- |
| soundkit-wasm (prebuilt `pkg/`, `runtime/streaming-media.mjs`) | https://github.com/wavey-ai/soundkit | 0.13.3 @ a1416ab81bfe | MIT | `js/vendor/wavey/soundkit/` (LICENSE alongside) |
| mel-spec (`SpeechToMel`, built with `wasm-pack --target web --features wasm`) | https://github.com/wavey-ai/mel-spec | 0.5.0 @ 338018e2b296 | MIT | `js/vendor/wavey/mel-spec/` (LICENSE alongside) |
| mfcc-rust (`speechsauce` 0.1.0, **modified**: see `js/vendor/wavey/mfcc/speechsauce-nodaw.patch` and README) via the NoDAW `nodaw-mfcc-wasm` wrapper (`src-wrapper/`, `wasm-pack --release --target web`) | https://github.com/wavey-ai/mfcc-rust | 0.1.0 @ 5446ff03f3a9 | Apache-2.0 | `js/vendor/wavey/mfcc/` (LICENSE alongside) |

Used by `analyze.html` (Lacquer desk) via `js/lacquer-spectral.js` and `js/vendor/wavey/wavey-audio.js` (NoDAW Labs glue):
soundkit-wasm decodes files the browser declines; mel-spec draws the spectral map and runs the model-free
vocal-activity detector. All processing is local to the browser tab.

mfcc-rust powers the **REFERENCE MATCH** dock (`js/lacquer-reference.js`): drop a reference track and the page compares
your mix's MFCC timbre profile and level-matched 40-band mel energy against it, all in the browser. Before building,
three upstream bugs were patched (Apache-2.0 §4(b) notice of modification): `stack_frames` produced all-zero frames,
`power_spectrum` returned |X|/N instead of |X|²/N, and the MFCC DCT scaling depended on track length. The patch is
shipped next to the binary. The Apache License 2.0 text is in `js/vendor/wavey/mfcc/LICENSE`.


## In-browser stem separation (`stems.html`, `js/roformer-web/`)

Runs RoFormer ONNX models fully client-side (WebGPU, WASM fallback) in a Web Worker. **No model weights are stored in
this repository**: they are fetched at runtime from Hugging Face at pinned commits, verified by SHA-256 and stored in
the visitor's browser (OPFS). All URLs, hashes and license metadata live in `js/roformer-web/models.js`.

| Component | Source | Version / commit | License | Location |
| --- | --- | --- | --- | --- |
| onnxruntime-web (vendored, unmodified npm build; jsDelivr only as fallback) | https://github.com/microsoft/onnxruntime | 1.30.0 | MIT | `js/roformer-web/vendor/ort/` |
| fflate (ZIP export) | https://github.com/101arrowz/fflate | 0.8.x | MIT, Copyright (c) 2023 Arjun Barrett | `js/roformer-web/vendor/fflate/` |
| coi-serviceworker (header-injection approach adapted for `stems-sw.js`) | https://github.com/gzuidhof/coi-serviceworker | v0.1.7 | MIT, Copyright (c) 2021 Guido Zuidhof | `js/roformer-web/vendor/coi-serviceworker/LICENSE`, `stems-sw.js` |
| BS-RoFormer-SW 6-stem fp16 ONNX (weights, runtime download) | https://huggingface.co/Acapellas/bs-roformer-sw-6stem-FP16-FP32-onnx | `3a8d965`, sha256 `d3d2bac7…c36444` | MIT (model card). **Weights are a re-host without a stated upstream license or provenance — review before commercial reliance** | not in repo |
| Mel-Band RoFormer Duality student ONNX (weights, runtime download) | https://huggingface.co/musetric/mel-band-roformer-duality-student-onnx | `0e04989` | Apache-2.0 | not in repo |
| Mini-BS-RoFormer V2.5 46.2M ONNX (weights, runtime download) | https://huggingface.co/HiDolen/Mini-BS-RoFormer-V2.5-46.2M | `38dafc7` | MIT | not in repo |
| Design/conventions reference: bs-roformer-web (STFT layout, chunking) | https://github.com/elicwhite/bs-roformer-web | n/a (no code copied verbatim) | MIT, Copyright (c) 2026 Eli White | `js/roformer-web/` |
| Design reference: musetric (Duality graph geometry, WebGPU option) | https://github.com/musetric/musetric | n/a | MIT, Copyright (c) 2020-2026 Vladlen Popelenkov | `js/roformer-web/` |

Full notice with SHA-256 digests, citations and license texts: `js/roformer-web/NOTICE.md`.

## Stem Studio (`js/stem-studio/`, `stem-studio.html`)

| Component | License | Notes |
| --- | --- | --- |
| lamejs 1.2.1 (`js/stem-studio/vendor/lamejs`, unmodified) | LGPL-3.0 | lazy-loaded only for MP3 export; delete the folder to drop it |
| DrumSep v2 drum separator (HDemucs; fine-tune of inagoy/drumsep), 10 s-window fp16 browser build, 168,050,967 B, sha256 `b05779ea…32839a` | MIT | **training-data provenance not independently verified**; not in repo and not hosted yet (see `docs/stem-studio-drums.md`) |
| onnxruntime-web, fflate | MIT | reused from `js/roformer-web/vendor` |
| DrumSep HT-RoFormer (Sucial), 6 drum stems, optional | **No licence published** (weights and inference code) | **not hosted**: the option stays disabled (`DRUM_HTR_DEFAULT_URL = null` in `js/stem-studio/drums/drum-models.js`) until the author grants permission |
| Mel-Band RoFormer Karaoke (aufr33 & viperx), ONNX re-export by Acapellas, `b29e3d0`, fp16 460,432,035 B, sha256 `a733bd23…1b3e` | MIT (model card) | Vocals tab (lead / backing). Runtime download, not in repo. The original checkpoint has no stated licence (same caveat as BS-RoFormer-SW) |

Details: `js/stem-studio/NOTICE.md`, `docs/stem-studio-presets.md`, `docs/stem-studio-drums.md`.

## Voice Tags (`voice-tags.html`, `js/voice-tags/`)

Spoken producer tags and guide lines, made on the visitor's device. No model weights are stored in this repository.

| Component | Source | Version / commit | License | Location |
| --- | --- | --- | --- | --- |
| ZONOS3 Mini in-browser engine (`servers/web` build: `engine.js`, `worker.js`, `codec-worker.js`, unmodified `vite build` output) | https://github.com/Zyphra/ZONOS3-Mini | `96d9e0e` | MIT, Copyright (c) 2026 Zyphra, Inc. Upstream NOTICE lists MIT / Apache-2.0 / Unicode-3.0 components | `js/voice-tags/vendor/zonos3-web/` (LICENSE, NOTICE, licenses/ alongside) |
| ZONOS3 Mini weights (`web/` shards, runtime download, cached in Cache Storage) | https://huggingface.co/Zyphra/ZONOS3-Mini | `d2d142a` | Apache-2.0 | not in repo |
| tiny-voca ONNX + config + phonemizer data (runtime download, SHA-256 checked) | https://huggingface.co/n4ze3m/tiny-voca | `eac048b`, model sha256 `fe6d9187…ae46` | Apache-2.0 (model, code). Dictionary from CMUdict (BSD-style, `phonemizer/LICENSE.cmudict`) | not in repo |
| tiny-voca text helpers and worker logic (adapted) | https://github.com/n4ze3m/tiny-voca (`web/public/worker.js`) | main | Apache-2.0. Modified: ES modules, SHA-256 checks, vendored ORT | `js/voice-tags/text.js`, `js/voice-tags/tinyvoca-worker.js` |
| dizione 0.1.0 phonemizer (Python source, zipped for Pyodide) | https://pypi.org/project/dizione/ | 0.1.0 | Apache-2.0, Muhammed Nazeem | `js/voice-tags/vendor/dizione/` (LICENSE alongside) |
| Pyodide (runs dizione) | https://pyodide.org | 0.26.4, loaded from jsDelivr, not bundled | MPL-2.0 | CDN |

## Stem fidelity (residual stem, null test)

* **badwolf-ro/stemsep** (MIT) — https://github.com/badwolf-ro/stemsep. Idea credit only; no code copied.
  The "residual stem" rule (the catch-all stem is `mix - (all other stems)`) and the "null test" readout
  (dB of `mix - sum(stems)` relative to the mix) are used in `fidelity.js`, which is an independent implementation.
* **TramEFX stem-separator** (MIT) and **Stavion-Colquitt/nussl modernized fork** (MIT) — reviewed for model
  lineup and SDR benchmarking ideas. Nothing from either is included in this repository or shipped.
