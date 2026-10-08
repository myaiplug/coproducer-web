# mfcc-rust / speechsauce (wavey-ai) — browser timbre profile

Uses mfcc-rust by wavey-ai (Apache-2.0): https://github.com/wavey-ai/mfcc-rust @ 5446ff03f3a9 (crate `speechsauce` 0.1.0).

`nodaw_mfcc_wasm*` is a thin NoDAW Labs wasm-bindgen wrapper (`src-wrapper/`), built with
`wasm-pack build --release --target web`. It returns per-frame 13 MFCCs + 40 log mel-filterbank energies.

**Modified files (Apache-2.0 §4(b))** — `speechsauce-nodaw.patch` was applied to upstream before building:
1. `processing.rs::stack_frames`: upstream copied frames with a chunk-zip that produced all-zero frames; frames are now
   copied explicitly.
2. `processing.rs::power_spectrum`: squares the magnitude (speechpy's `1/N * |X|^2`); upstream returned `|X|/N`.
3. `feature.rs::mfcc`: orthonormal DCT scaling now uses the transform length (num_filters) instead of the total element
   count, so MFCC scale no longer depends on track length.
