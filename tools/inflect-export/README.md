# Inflect Mini v3 → Stem Studio guide voice

Scripts that produce everything in `js/guide-voice/` from `owensong/Inflect-Mini-v3` @ `0490aee6a9c66f9375b48287a2c5e5788afd00cc`
(code and weights Apache-2.0). Python 3.12, torch 2.11 (CPU), misaki 0.9.4, onnx, onnxruntime, soundfile; ffmpeg.

```sh
hf download owensong/Inflect-Mini-v3 --revision 0490aee6a9c66f9375b48287a2c5e5788afd00cc --local-dir Inflect-Mini-v3
python Inflect-Mini-v3/core/verify_release.py         # upstream integrity check

# 1. built-in clips (Inflect's own CPU runtime and front end)
python render_clips.py --inflect Inflect-Mini-v3 --out ../../js/guide-voice/clips

# 2. ONNX for the live engine
INFLECT_DIR=Inflect-Mini-v3 INFLECT_ONNX_OUT=out python export.py   # text.onnx, decode.onnx, voice tables, inflect_meta.json
python fp16w.py out/text.onnx out/text_w16.onnx                       # weights stored float16, compute stays float32
python fp16w.py out/decode.onnx out/decode_w16.onnx
INFLECT_ONNX_OUT=out python ort_run.py text_w16.onnx decode_w16.onnx phones.json   # [["hope", "<phonemes>"], ...]
```

Export notes: the STFT is swapped for a real-valued conv STFT (complex STFT does not export) and InstanceNorm1d is
written out by hand (unknown channel size). The text graph matches PyTorch durations to 1e-6. Stored float16 weights
cost 0.058 log-mel L1 against float32; dynamic int8 on the vocoder (0.49) was audibly worse and is not used.
Re-running `export.py` + `fp16w.py` reproduced `text_w16.onnx` and `decode_w16.onnx` byte for byte (the SHA-256 values
pinned in `js/guide-voice/models.js`).

Hosting the live engine: upload `text_w16.onnx`, `decode_w16.onnx`, `voice_styles_f32.bin`, `voice_affines_f32.bin`
with the Apache-2.0 license and `js/guide-voice/NOTICE.md`, served with CORS, then set `INFLECT_ONNX_BASE`.
