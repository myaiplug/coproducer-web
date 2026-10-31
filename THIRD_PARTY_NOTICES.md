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
this repository**: they are fetched at runtime from Hugging Face at pinned commits, verified by SHA-256 and cached in
the visitor's browser. All URLs, hashes and license metadata live in `js/roformer-web/models.js`.

| Component | Source | Version / commit | License | Location |
| --- | --- | --- | --- | --- |
| onnxruntime-web (loaded from jsDelivr at runtime) | https://github.com/microsoft/onnxruntime | 1.30.0 | MIT | CDN, not vendored |
| BS-RoFormer-SW 6-stem fp16 ONNX (weights, runtime download) | https://huggingface.co/Acapellas/bs-roformer-sw-6stem-FP16-FP32-onnx | `3a8d965`, sha256 `d3d2bac7…c36444` | MIT (model card). **Weights are a re-host without a stated upstream license or provenance — review before commercial reliance** | not in repo |
| Mel-Band RoFormer Duality student ONNX (weights, runtime download) | https://huggingface.co/musetric/mel-band-roformer-duality-student-onnx | `0e04989` | Apache-2.0 | not in repo |
| Mini-BS-RoFormer V2.5 46.2M ONNX (weights, runtime download) | https://huggingface.co/HiDolen/Mini-BS-RoFormer-V2.5-46.2M | `38dafc7` | MIT | not in repo |
| Design/conventions reference: bs-roformer-web (STFT layout, chunking) | https://github.com/elicwhite/bs-roformer-web | n/a (no code copied verbatim) | MIT, Copyright (c) 2026 Eli White | `js/roformer-web/` |
| Design reference: musetric (Duality graph geometry, WebGPU option) | https://github.com/musetric/musetric | n/a | MIT, Copyright (c) 2020-2026 Vladlen Popelenkov | `js/roformer-web/` |

Full notice with SHA-256 digests, citations and license texts: `js/roformer-web/NOTICE.md`.
