# Third-party notices

Uses soundkit / mel-spec by wavey-ai (MIT).

| Component | Source | Version / commit | License | Location |
| --- | --- | --- | --- | --- |
| soundkit-wasm (prebuilt `pkg/`, `runtime/streaming-media.mjs`) | https://github.com/wavey-ai/soundkit | 0.13.3 @ a1416ab81bfe | MIT | `js/vendor/wavey/soundkit/` (LICENSE alongside) |
| mel-spec (`SpeechToMel`, built with `wasm-pack --target web --features wasm`) | https://github.com/wavey-ai/mel-spec | 0.5.0 @ 338018e2b296 | MIT | `js/vendor/wavey/mel-spec/` (LICENSE alongside) |

Used by `analyze.html` (Lacquer desk) via `js/lacquer-spectral.js` and `js/vendor/wavey/wavey-audio.js` (NoDAW Labs glue):
soundkit-wasm decodes files the browser declines; mel-spec draws the spectral map and runs the model-free
vocal-activity detector. All processing is local to the browser tab.
