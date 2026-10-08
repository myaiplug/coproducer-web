//! Timbre / tonal-balance features in the browser, built on wavey-ai/mfcc-rust (speechsauce, Apache-2.0).
use ndarray::ArrayView1;
use speechsauce::config::SpeechConfigBuilder;
use speechsauce::feature::{mfcc, mfe};
use wasm_bindgen::prelude::*;

pub const NUM_CEPSTRAL: usize = 13;
pub const NUM_FILTERS: usize = 40;

/// Returns frame-major features: for every analysis frame, 13 MFCCs followed by 40
/// log mel-filterbank energies (natural log). Audio is processed in fixed-length chunks
/// so the MFCC scaling is identical for every track (speechsauce's DCT normalisation
/// depends on the number of frames in the call).
#[wasm_bindgen]
pub fn analyze(samples: &[f32], sample_rate: u32, fft_points: usize, chunk_seconds: f32, low_hz: f32, high_hz: f32) -> Result<Vec<f32>, JsError> {
    let sr = sample_rate as usize;
    if fft_points < 64 || !fft_points.is_power_of_two() {
        return Err(JsError::new("fft_points must be a power of two >= 64"));
    }
    let frame_len = fft_points as f32 / sample_rate as f32;
    let high = high_hz.min(sample_rate as f32 / 2.0);
    let config = SpeechConfigBuilder::new(sr)
        .fft_points(fft_points)
        .frame_length(frame_len)
        .frame_stride(frame_len / 2.0)
        .num_cepstral(NUM_CEPSTRAL)
        .low_freq(low_hz.max(0.0))
        .high_freq(high)
        .dc_elimination(true)
        .build();
    let chunk = ((chunk_seconds * sample_rate as f32) as usize).max(fft_points * 4);
    let mut out = Vec::new();
    let mut pos = 0usize;
    while pos + chunk <= samples.len() {
        let view = ArrayView1::from(&samples[pos..pos + chunk]);
        let cc = mfcc(view, &config);
        let (fb, _) = mfe(view, &config);
        let frames = cc.shape()[0].min(fb.shape()[0]);
        for f in 0..frames {
            for c in 0..NUM_CEPSTRAL { out.push(cc[[f, c]]); }
            for b in 0..NUM_FILTERS { out.push(fb[[f, b]].ln()); }
        }
        pos += chunk;
    }
    Ok(out)
}

#[wasm_bindgen]
pub fn layout() -> Vec<u32> { vec![NUM_CEPSTRAL as u32, NUM_FILTERS as u32] }

#[wasm_bindgen]
pub fn version() -> String { "nodaw-mfcc-wasm 0.1.0 (wavey-ai/mfcc-rust speechsauce, Apache-2.0)".into() }
