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

