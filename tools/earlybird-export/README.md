# Earlybird-29M → Stem Studio voice commands

Builds `js/voice-commands/model/` from `sahilmahendrakar/Earlybird-29M` @ `b24d6bd6b92ab2a0ef31e438b775662d495c0860`
(code and weights MIT; base model Moonshine streaming tiny, MIT). Python 3.12, torch 2.11 (CPU), transformers 5.x,
onnx, onnxruntime. Run from a folder where `model/` is the downloaded repo.

```sh
hf download sahilmahendrakar/Earlybird-29M --revision b24d6bd6b92ab2a0ef31e438b775662d495c0860 --local-dir model
python export_eb.py      # out/encoder.onnx, out/decoder.onnx (checks the torch re-implementation against eb.transcribe on EB_SAMPLES)
python grammar.py        # out/commands.json (phrases + token ids), out/vocab.json
python extmap.py         # out/*_graph.onnx (structure only) + *_weights.json (where each weight comes from in earlybird.safetensors)
EB_SAMPLES=samples python eval_ort.py out/encoder.onnx out/decoder.onnx   # accuracy / false accepts per threshold
```

* `encoder.onnx`: audio[1,N] (16 kHz) → mem[1,T,320]; whole utterance, same maths as `Stream._step` from reset.
  `asinh` is written out and `repeat_interleave` replaced, so the tracer can export it (opset 17).
* `decoder.onnx`: ids[1,L], mem → logits[1,L,V], no KV cache (commands are a few tokens).
* `extmap.py` strips every large initializer and records its source tensor (and whether it is transposed) in the
  original packed file. The browser downloads `earlybird.safetensors` from Hugging Face at the pinned commit
  (SHA-256 checked), unpacks it exactly as `earlybird.py` does (`js/voice-commands/unpack.js`, byte-identical,
  see the test) and passes the buffers to ONNX Runtime Web as `externalData`. No model weights are re-hosted.
* Recognition: greedy transcript, then the 8 grammar phrases nearest by edit distance are rescored by the model
  (sum of log-probs of the phrase + end token, with and without a full stop); the best is accepted if its log-prob is
  within 12 of the free transcript's or its edit distance is ≤ 0.3. The thresholds were picked on synthetic TTS speech;
  see the PR for the numbers and their limits.
